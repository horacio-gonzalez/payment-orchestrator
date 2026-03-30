import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';

describe('RedisService', () => {
  let service: RedisService;
  let mockRedis: any;

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      ttl: jest.fn(),
      ping: jest.fn(),
      flushdb: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        { provide: 'REDIS', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  describe('get', () => {
    it('should return value from Redis', async () => {
      mockRedis.get.mockResolvedValue('value');
      expect(await service.get('key')).toBe('value');
    });

    it('should return null on error (graceful degradation)', async () => {
      mockRedis.get.mockRejectedValue(new Error('connection lost'));
      expect(await service.get('key')).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value in Redis', async () => {
      await service.set('key', 'value');
      expect(mockRedis.set).toHaveBeenCalledWith('key', 'value');
    });

    it('should not throw on error', async () => {
      mockRedis.set.mockRejectedValue(new Error('fail'));
      await expect(service.set('key', 'value')).resolves.toBeUndefined();
    });
  });

  describe('setex', () => {
    it('should set value with TTL', async () => {
      await service.setex('key', 60, 'value');
      expect(mockRedis.setex).toHaveBeenCalledWith('key', 60, 'value');
    });

    it('should not throw on error', async () => {
      mockRedis.setex.mockRejectedValue(new Error('fail'));
      await expect(service.setex('key', 60, 'value')).resolves.toBeUndefined();
    });
  });

  describe('del', () => {
    it('should delete key from Redis', async () => {
      await service.del('key');
      expect(mockRedis.del).toHaveBeenCalledWith('key');
    });

    it('should not throw on error', async () => {
      mockRedis.del.mockRejectedValue(new Error('fail'));
      await expect(service.del('key')).resolves.toBeUndefined();
    });
  });

  describe('exists', () => {
    it('should return true when key exists', async () => {
      mockRedis.exists.mockResolvedValue(1);
      expect(await service.exists('key')).toBe(true);
    });

    it('should return false when key does not exist', async () => {
      mockRedis.exists.mockResolvedValue(0);
      expect(await service.exists('key')).toBe(false);
    });

    it('should return false on error', async () => {
      mockRedis.exists.mockRejectedValue(new Error('fail'));
      expect(await service.exists('key')).toBe(false);
    });
  });

  describe('ttl', () => {
    it('should return TTL value', async () => {
      mockRedis.ttl.mockResolvedValue(300);
      expect(await service.ttl('key')).toBe(300);
    });

    it('should return -1 on error', async () => {
      mockRedis.ttl.mockRejectedValue(new Error('fail'));
      expect(await service.ttl('key')).toBe(-1);
    });
  });

  describe('ping', () => {
    it('should return true on PONG', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      expect(await service.ping()).toBe(true);
    });

    it('should return false on error', async () => {
      mockRedis.ping.mockRejectedValue(new Error('fail'));
      expect(await service.ping()).toBe(false);
    });
  });

  describe('flushdb', () => {
    it('should flush database', async () => {
      await service.flushdb();
      expect(mockRedis.flushdb).toHaveBeenCalled();
    });

    it('should not throw on error', async () => {
      mockRedis.flushdb.mockRejectedValue(new Error('fail'));
      await expect(service.flushdb()).resolves.toBeUndefined();
    });
  });

  describe('getClient', () => {
    it('should return the underlying Redis client', () => {
      expect(service.getClient()).toBe(mockRedis);
    });
  });
});
