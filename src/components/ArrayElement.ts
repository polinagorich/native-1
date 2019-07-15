import { FieldsetElement } from '@/components/FieldsetElement';
import { ArrayButton } from '@/components/ArrayButton';
import { ArrayComponent } from '@/types';

export const ArrayElement: ArrayComponent = {
  name: 'ArrayElement',
  functional: true,
  render(h, { data, props }) {
    const nodes = props.field.children.map((field) => h(field.input.component, {
      props: { field }
    }));

    if (!props.field.uniqueItems) {
      nodes.push(h(ArrayButton, data));
    }

    return h(FieldsetElement, data, nodes);
  }
};
