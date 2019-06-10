import { UniqueId } from '@/lib/UniqueId';

describe('lib/UniqueId', () => {
  describe('UniqueId.get(prefix = "", delimiter = "-")', () => {
    it('should successfully generate ID', () => {
      expect(UniqueId.get().length).toEqual(8);
    });

    it('should successfully generate ID with a prefix', () => {
      expect(UniqueId.get('id').startsWith('id-')).toBeTruthy();
    });

    it('should successfully generate ID with a prefix and delimiter', () => {
      expect(UniqueId.get('id', '.').startsWith('id.')).toBeTruthy();
    });
  });
});
