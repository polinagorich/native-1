import { Parser } from '@/parsers/Parser';
import { JsonSchema } from '@/types/jsonschema';
import { UniqueId } from '@/components/FormSchema';
import { Objects } from '@/lib/Objects';

import {
  Dictionary,
  ObjectField,
  ObjectDescriptor,
  ParserOptions,
  AbstractUISchemaDescriptor,
  ObjectFieldChild,
  DescriptorConstructor,
  FieldKind,
  UnknowParser
} from '@/types';

export class ObjectParser extends Parser<Dictionary, ObjectField, ObjectDescriptor> {
  properties: Dictionary<JsonSchema> = {};
  dependencies: Dictionary<string[]> = {};
  childrenParsers: Dictionary<UnknowParser> = {};

  get kind(): FieldKind {
    return 'object';
  }

  get propertiesList() {
    const keys = Object.keys(this.properties);
    const items = this.field.descriptor.order instanceof Array
      ? this.field.descriptor.order
      : keys;

    if (items.length < keys.length) {
      keys.forEach((prop) => {
        if (!items.includes(prop)) {
          items.push(prop);
        }
      });
    }

    return items;
  }

  get children(): ObjectFieldChild[] {
    const name = this.options.name;
    const requiredFields = this.schema.required instanceof Array
      ? this.schema.required
      : [];

    return this.propertiesList
      .map((key): { key: string; options: ParserOptions<unknown, AbstractUISchemaDescriptor> } => ({
        key,
        options: {
          schema: this.properties[key],
          model: this.model.hasOwnProperty(key) ? this.model[key] : this.properties[key].default,
          descriptor: this.getChildDescriptor(key),
          descriptorConstructor: this.getChildDescriptorConstructor(key),
          bracketedObjectInputName: this.options.bracketedObjectInputName,
          id: `${this.id}-${key}`,
          name: this.getChildName(key, name),
          required: requiredFields.includes(key),
          onChange: (value) => {
            this.model[key] = value;
          }
        }
      }))
      .map(({ options, ...args }) => ({
        ...args,
        parser: Parser.get(options, this)
      }))
      .filter(({ parser }) => parser instanceof Parser)
      .map(({ key, parser }: any) => {
        const field = parser.field as ObjectField;

        this.childrenParsers[key] = parser;

        /**
         * Update the parser.options.onChange reference to
         * enable dependencies update
         */
        parser.options.onChange = (value: unknown) => {
          /**
           * No need to set `this.rawValue[key] = value` because
           * the `this.commit()` will trigger an update of
           * `this.rawValue` using `this.model`
           */
          this.model[key] = value;

          this.commit();
          this.updateDependencies(key, parser);
        };

        return field;
      });
  }

  isEmpty(data: Dictionary = this.model) {
    return Objects.isEmpty(data);
  }

  updateDependencies(key: string, parser: UnknowParser) {
    if (this.dependencies[key]) {
      const needUpdate = [ parser.field ];
      const isRequired = !parser.isEmpty();
      const fieldRequired = isRequired || this.hasFilledDependency(key);

      this.setRequiredDependency(key, parser, fieldRequired);

      this.dependencies[key].forEach((prop) => {
        const dependencyParser = this.childrenParsers[prop];

        this.setRequiredDependency(prop, dependencyParser, isRequired);
        needUpdate.push(dependencyParser.field);
      });

      this.requestRender(needUpdate);
    }
  }

  hasFilledDependency(key: string) {
    return Object.keys(this.dependencies).some((prop) => {
      return this.dependencies[prop].includes(key) && !this.childrenParsers[prop].isEmpty();
    });
  }

  setRequiredDependency(key: string, parser: UnknowParser, required: boolean) {
    if (parser.isEmpty(this.model[key])) {
      parser.field.key = UniqueId.get(key);
    }

    parser.field.required = required;
  }

  getChildName(key: string, name?: string) {
    if (name) {
      return this.options.bracketedObjectInputName
        ? `${name}[${key}]`
        : `${name}.${key}`;
    }

    return key;
  }

  getChildDescriptor(key: string) {
    const properties = this.field.descriptor.properties;

    return properties
      ? typeof properties[key] === 'function'
        ? (properties[key] as Function)(properties[key])
        : properties[key]
      : this.options.descriptorConstructor(this.properties[key]);
  }

  getChildDescriptorConstructor(key: string): DescriptorConstructor {
    const properties = this.field.descriptor.properties;

    return properties && typeof properties[key] === 'function'
      ? properties[key] as DescriptorConstructor
      : this.options.descriptorConstructor;
  }

  parse() {
    if (this.schema.properties) {
      this.properties = { ...this.schema.properties };
    }

    this.parseDependencies();

    this.field.children = this.children;

    /**
     * attributes `required` and `aria-required` are not applicable here
     */
    delete this.attrs.required;
    delete this.attrs['aria-required'];

    if (this.isRoot) {
      /**
       * attribute `name` is not applicable here
       */
      delete this.attrs.name;
    }

    this.commit();
  }

  parseDependencies() {
    const dependencies = this.schema.dependencies;

    if (dependencies) {
      Object.keys(dependencies).forEach((key) => {
        const dependency = dependencies[key];

        if (dependency instanceof Array) {
          this.dependencies[key] = dependency;
        } else {
          const properties = dependency.properties || {};

          this.dependencies[key] = Object.keys(properties);

          Object.keys(properties).forEach((prop) => {
            this.properties[prop] = properties[prop];
          });
        }
      });
    }
  }

  parseValue(data: Dictionary): Dictionary {
    return data || {};
  }
}

Parser.register('object', ObjectParser);
