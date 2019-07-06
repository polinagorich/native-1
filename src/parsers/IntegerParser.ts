import { Parser } from '@/parsers/Parser';
import { NumberParser } from '@/parsers/NumberParser';
import { FieldKind, IIntegerParser } from '@/types';

export class IntegerParser extends NumberParser implements IIntegerParser {
  get kind(): FieldKind {
    return this.isEnumItem ? 'radio' : 'integer';
  }

  parseExclusiveKeywords() {
    if (this.schema.hasOwnProperty('exclusiveMinimum')) {
      const exclusiveMinimum = this.schema.exclusiveMinimum as number;

      this.field.attrs.input.min = exclusiveMinimum + 1;
    }

    if (this.schema.hasOwnProperty('exclusiveMaximum')) {
      const exclusiveMaximum = this.schema.exclusiveMaximum as number;

      this.field.attrs.input.max = exclusiveMaximum - 1;
    }
  }

  parseValue(data: number): number | undefined {
    const value = Number(data);

    return Number.isNaN(value) ? undefined : Number.parseInt(`${data}`, 10);
  }
}

Parser.register('integer', IntegerParser);
