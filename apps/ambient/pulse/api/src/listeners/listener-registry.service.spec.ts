import { Test, TestingModule } from '@nestjs/testing';
import { ListenerRegistryService, ListenerType } from './listener-registry.service';

describe('ListenerRegistryService', () => {
  let service: ListenerRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ListenerRegistryService],
    }).compile();

    service = module.get<ListenerRegistryService>(ListenerRegistryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register()', () => {
    it('should register a new listener', () => {
      service.register('listener-1', 'db-watcher', 'Test DB Listener');
      const result = service.getById('listener-1');
      expect(result).toBeDefined();
      expect(result!.id).toBe('listener-1');
      expect(result!.type).toBe('db-watcher');
      expect(result!.name).toBe('Test DB Listener');
    });

    it('should initialize listener as inactive with zero firing count', () => {
      service.register('listener-2', 'file-watcher', 'Test File Listener');
      const result = service.getById('listener-2');
      expect(result!.active).toBe(false);
      expect(result!.lastFiredAt).toBeNull();
      expect(result!.firingCount).toBe(0);
    });

    it('should support all listener types', () => {
      const types: ListenerType[] = ['db-watcher', 'file-watcher', 'internal-a2a'];
      types.forEach((type, i) => {
        service.register(`listener-${type}-${i}`, type, `Listener ${type}`);
        expect(service.getById(`listener-${type}-${i}`)!.type).toBe(type);
      });
    });

    it('should overwrite an existing listener with the same id', () => {
      service.register('dup-id', 'db-watcher', 'Original');
      service.register('dup-id', 'file-watcher', 'Replaced');
      const result = service.getById('dup-id');
      expect(result!.type).toBe('file-watcher');
      expect(result!.name).toBe('Replaced');
    });
  });

  describe('activate()', () => {
    it('should set the listener to active', () => {
      service.register('act-id', 'db-watcher', 'Activatable');
      service.activate('act-id');
      expect(service.getById('act-id')!.active).toBe(true);
    });

    it('should do nothing if the listener id does not exist', () => {
      // Must not throw
      expect(() => service.activate('nonexistent')).not.toThrow();
    });
  });

  describe('deactivate()', () => {
    it('should set the listener to inactive', () => {
      service.register('deact-id', 'db-watcher', 'Deactivatable');
      service.activate('deact-id');
      service.deactivate('deact-id');
      expect(service.getById('deact-id')!.active).toBe(false);
    });

    it('should do nothing if the listener id does not exist', () => {
      expect(() => service.deactivate('nonexistent')).not.toThrow();
    });
  });

  describe('recordFiring()', () => {
    it('should increment the firing count', () => {
      service.register('fire-id', 'file-watcher', 'Fireable');
      service.recordFiring('fire-id');
      service.recordFiring('fire-id');
      expect(service.getById('fire-id')!.firingCount).toBe(2);
    });

    it('should set lastFiredAt to a valid ISO string', () => {
      service.register('fire-ts', 'db-watcher', 'Timestamp Test');
      const before = new Date().toISOString();
      service.recordFiring('fire-ts');
      const after = new Date().toISOString();

      const lastFiredAt = service.getById('fire-ts')!.lastFiredAt!;
      expect(lastFiredAt >= before).toBe(true);
      expect(lastFiredAt <= after).toBe(true);
    });

    it('should do nothing if the listener id does not exist', () => {
      expect(() => service.recordFiring('nonexistent')).not.toThrow();
    });
  });

  describe('getAll()', () => {
    it('should return all registered listeners', () => {
      service.register('a', 'db-watcher', 'A');
      service.register('b', 'file-watcher', 'B');
      service.register('c', 'internal-a2a', 'C');
      const all = service.getAll();
      expect(all.length).toBe(3);
      expect(all.map((l) => l.id).sort()).toEqual(['a', 'b', 'c']);
    });

    it('should return empty array when no listeners registered', () => {
      expect(service.getAll()).toEqual([]);
    });
  });

  describe('getById()', () => {
    it('should return undefined for unknown id', () => {
      expect(service.getById('unknown')).toBeUndefined();
    });

    it('should return the registered listener', () => {
      service.register('known', 'db-watcher', 'Known Listener');
      const result = service.getById('known');
      expect(result).toBeDefined();
      expect(result!.name).toBe('Known Listener');
    });
  });
});
