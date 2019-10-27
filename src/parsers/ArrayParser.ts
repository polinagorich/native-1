import { SetParser } from '@/parsers/SetParser';
import { JsonSchema } from '@/types/jsonschema';
import { Objects } from '@/lib/Objects';
import { Arrays } from '@/lib/Arrays';
import { Value } from '@/lib/Value';
import { ArrayField, ParserOptions, FieldKind, ArrayItemField, UnknowParser, ArrayDescriptor } from '@/types';
import { ArrayUIDescriptor } from '@/descriptors/ArrayUIDescriptor';
import { UniqueId } from '@/lib/UniqueId';

export class ArrayParser extends SetParser<any, ArrayField, ArrayUIDescriptor> {
  readonly items: JsonSchema[] = [];
  additionalItems?: JsonSchema;
  minItems = 0;
  maxItems?: number;
  max = -1;
  count = 0;
  radioIndex = 0;
  childrenParsers: UnknowParser[] = [];

  constructor(options: ParserOptions<any, ArrayField, ArrayDescriptor>, parent?: UnknowParser) {
    super('array', options, parent);
  }

  get initialValue(): unknown[] {
    const value = this.options.model || this.schema.default;

    return value instanceof Array ? [ ...value ] : [];
  }

  get limit(): number {
    if (this.field.uniqueItems || this.items.length === 0) {
      return this.items.length;
    }

    if (this.count < this.minItems || !Array.isArray(this.schema.items)) {
      return this.count;
    }

    return this.count < this.items.length
      ? this.count
      : this.items.length;
  }

  get children(): ArrayItemField[] {
    const limit = this.limit;
    const fields = Array(...Array(limit))
      .map((x, index) => this.getFieldIndex(index))
      .filter((field) => field !== null) as ArrayItemField[];

    if (limit < this.count && this.additionalItems) {
      let index = limit;

      do {
        const additionalField = this.getFieldItem(this.additionalItems, index);

        if (additionalField === null) {
          break;
        }

        fields.push(additionalField);
      } while (++index < this.count);
    }

    return fields;
  }

  setFieldValue(field: ArrayItemField, value: unknown) {
    // since it's possible to order children fields, the
    // current field's index must be computed each time
    // TODO: an improvement can be done by using a caching index table
    const index = this.childrenParsers.findIndex((parser) => parser.field === field);

    this.setIndexValue(index, value);
  }

  setIndexValue(index: number, value: unknown) {
    this.rawValue[index] = value;

    this.setValue(this.rawValue);
  }

  isEmpty(data: unknown = this.model) {
    return data instanceof Array && data.length === 0;
  }

  clearModel() {
    for (let i = 0; i < this.rawValue.length; i++) {
      this.rawValue[i] = undefined;
    }

    this.model.splice(0);
  }

  setValue(value: unknown[]) {
    this.rawValue = value as any;

    this.model.splice(0);
    this.model.push(...this.parseValue(this.rawValue) as any);
  }

  reset() {
    this.clearModel();
    this.initialValue.forEach((value, index) => this.setIndexValue(index, value));
    this.childrenParsers.forEach((parser) => parser.reset());
  }

  clear() {
    this.clearModel();
    this.childrenParsers.forEach((parser) => parser.clear());
  }

  getFieldItemName(name: string) {
    return this.root.options.bracketedObjectInputName ? `${name}[]` : name;
  }

  getFieldItem(itemSchema: JsonSchema, index: number): ArrayItemField | null {
    const kind: FieldKind | undefined = this.field.uniqueItems
      ? 'boolean'
      : SetParser.kind(itemSchema);

    const itemModel = typeof this.model[index] === 'undefined'
      ? itemSchema.default
      : this.model[index];

    const descriptorItem = this.descriptor.items instanceof Array
      ? this.descriptor.items[index]
      : this.descriptor.items || { kind };

    const itemName = this.options.name || itemModel;
    const name = kind === 'enum' && this.radioIndex++
      ? `${itemName}-${this.radioIndex}`
      : itemName;

    const parser = SetParser.get({
      kind: kind,
      schema: itemSchema,
      model: itemModel,
      id: `${this.id}-${index}`,
      name: this.getFieldItemName(name),
      descriptor: descriptorItem,
      components: this.root.options.components
    }, this);

    if (this.rawValue.length <= index) {
      this.rawValue.push(undefined);
    }

    if (parser) {
      this.childrenParsers.push(parser);

      if (kind === 'boolean') {
        this.parseCheckboxField(parser, itemModel);
      }

      // update the index raw value
      this.rawValue[index] = parser.model;

      // set the onChange option after the parser initialization
      // to prevent first field value emit
      parser.options.onChange = this.field.sortable
        ? (value) => {
          this.setFieldValue(parser.field, value);
          this.commit();
        }
        : (value) => {
          this.setIndexValue(index, value);
          this.commit();
        };

      return parser.field;
    }

    return null;
  }

  getFieldIndex(index: number) {
    const itemSchema = this.schema.items instanceof Array || this.field.uniqueItems
      ? this.items[index]
      : this.items[0];

    return this.getFieldItem(itemSchema, index);
  }

  move(from: number, to: number) {
    const items = this.field.childrenList;

    if (items[from] && items[to]) {
      const movedField = Arrays.swap<ArrayItemField>(items, from, to);

      Arrays.swap(this.rawValue, from, to);

      items[from].key = UniqueId.get(items[from].name);
      items[to].key = UniqueId.get(items[to].name);

      this.field.setValue(this.rawValue);

      return movedField;
    }

    return undefined;
  }

  setCount(value: number) {
    if (this.maxItems && value > this.maxItems) {
      return;
    }

    this.count = value;

    this.childrenParsers.splice(0);

    const sortable = this.field.sortable;
    const items = this.children;

    this.field.children = {};
    this.field.childrenList = items;

    items.forEach((item, i) => {
      this.field.children[i] = item;
    });

    // apply array's model
    this.setValue(this.rawValue);

    const isDisabled = ([ from, to ]: [ number, number ]) => {
      return !sortable || !items[from] || !items[to];
    };

    const upIndexes = (field: ArrayItemField): [ number, number ] => {
      const from = Arrays.index(items, field);
      const to = from - 1;

      return [ from, to ];
    };

    const downIndexes = (field: ArrayItemField): [ number, number ] => {
      const from = Arrays.index(items, field);
      const to = from + 1;

      return [ from, to ];
    };

    items.forEach((field) => {
      field.buttons = {
        moveUp: {
          get disabled() {
            return isDisabled(upIndexes(field));
          },
          trigger: () => this.move(...upIndexes(field))
        },
        moveDown: {
          get disabled() {
            return isDisabled(downIndexes(field));
          },
          trigger: () => this.move(...downIndexes(field))
        },
        delete: {
          disabled: !sortable,
          trigger: () => {
            const index = Arrays.index(items, field);
            const deletedField = items.splice(index, 1).pop();

            if (deletedField) {
              this.rawValue.splice(index, 1);
              this.field.setValue(this.rawValue);

              this.count--;

              this.requestRender();
            }

            return deletedField;
          }
        }
      };
    });
  }

  parse() {
    this.field.sortable = false;

    if (this.schema.items) {
      if (this.schema.items instanceof Array) {
        this.items.push(...this.schema.items);

        if (this.schema.additionalItems && !Objects.isEmpty(this.schema.additionalItems)) {
          this.additionalItems = this.schema.additionalItems;
        }
      } else {
        this.items.push(this.schema.items);

        this.field.sortable = true;
      }
    }

    this.maxItems = this.schema.maxItems;
    this.minItems = this.schema.minItems || (this.field.required ? 1 : 0);

    const self = this;
    const resetField = this.field.reset;

    this.field.pushButton = {
      get disabled() {
        return self.count === self.max || self.items.length === 0;
      },
      trigger: () => {
        this.setCount(this.count + 1);
        this.requestRender();
      }
    };

    this.count = this.minItems > this.model.length
      ? this.minItems
      : this.model.length;

    // force render update for ArrayField
    this.field.reset = () => {
      resetField();
      this.requestRender();
    };

    this.parseUniqueItems();
    this.setCount(this.count);
    this.commit();
  }

  parseCheckboxField(parser: any, itemModel: unknown) {
    const isChecked = this.initialValue.includes(itemModel);

    parser.field.attrs.type = 'checkbox';

    parser.setValue = (checked: boolean) => {
      parser.rawValue = checked;
      parser.model = checked ? itemModel : undefined;
    };

    parser.setValue(isChecked);
  }

  parseUniqueItems() {
    if (this.schema.uniqueItems === true && this.items.length === 1) {
      const itemSchema = this.items[0];

      if (itemSchema.enum instanceof Array) {
        this.field.uniqueItems = true;
        this.maxItems = itemSchema.enum.length;
        this.count = this.maxItems;

        this.items.splice(0);
        itemSchema.enum.forEach((value) => this.items.push({
          ...itemSchema,
          enum: undefined,
          default: value,
          title: `${value}`
        }));

        this.max = this.items.length;
      } else {
        this.max = this.maxItems || this.items.length;
      }
    } else if (this.maxItems) {
      this.max = this.maxItems;
    } else if (this.schema.items instanceof Array) {
      this.max = this.additionalItems ? -1 : this.items.length;
    } else {
      this.max = -2;
    }

    if (this.field.uniqueItems) {
      const values: unknown[] = [];

      this.items.forEach((itemSchema) => {
        if (this.model.includes(itemSchema.default)) {
          values.push(itemSchema.default);
        } else {
          values.push(undefined);
        }
      });

      this.model.splice(0);
      this.model.push(...values);
    }
  }

  parseValue(data: unknown[]) {
    return Value.array(data);
  }
}

SetParser.register('array', ArrayParser);
