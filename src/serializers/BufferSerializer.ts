import { strToUint8, uint8ToStr } from '@bhoos/utils';
import { Serializer } from '../Serializer';
/**
 * Buffer based implementation for serializer. Can be used for
 * binary serialization while saving files, or communicating
 * over TCP/UDP network.
 */
export class BufferSerializer implements Serializer {
  private readonly buff: Buffer;
  public readonly version: number;
  private loading: boolean;
  private offset: number;

  constructor(version: number, size: number);
  constructor(version: number, buff: Buffer);
  constructor(version: number, buff: Buffer, offset: number);
  constructor(version: number, buff: Buffer | number, offset: number = 0) {
    this.version = version;
    if (typeof buff === 'number') {
      this.loading = false;
      this.buff = Buffer.allocUnsafe(buff);
      this.offset = 0;
    } else {
      this.loading = true;
      this.buff = buff;
      this.offset = offset;
    }
  }

  getBuffer() { return this.buff.slice(0, this.offset); }

  get length() {
    return this.offset;
  }

  mark() {
    const marker = this.offset;
    return () => {
      this.offset = marker;
    }
  }

  trackLength<T>(fn: (length: number) => T) {
    const mark = this.offset;
    let length = this.uint16(0);
    const lengthMarker = this.offset;
    try {
      const r = fn(length);
      if (!this.isLoading) {
        length = this.offset - lengthMarker;
        this.offset = mark;
        this.uint16(length);
      }
      // Keep the offset at right position after tracking
      this.offset = lengthMarker + length;
      return r;
    } catch (err) {
      // Reset the offset to original position
      this.offset = mark;
      throw err;
    }
  }

  end() {
    this.loading = true;
  }

  get isLoading() { return this.loading }

  op = (
    size: number,
    read: (offset: number) => number,
    write: (k: number, offset: number) => number
  ) => (k: number): number => {
    if (this.loading) {
      const r = read.call(this.buff, this.offset);
      this.offset += size;
      return r;
    } else {
      this.offset = write.call(this.buff, k, this.offset);
      return k;
    }
  }

  int8 = this.op(1, Buffer.prototype.readInt8, Buffer.prototype.writeInt8);
  int16 = this.op(2, Buffer.prototype.readInt16BE, Buffer.prototype.writeInt16BE);
  int32 = this.op(4, Buffer.prototype.readInt32BE, Buffer.prototype.writeInt32BE);
  uint8 = this.op(1, Buffer.prototype.readUInt8, Buffer.prototype.writeUInt8);
  uint16 = this.op(2, Buffer.prototype.readUInt16BE, Buffer.prototype.writeUInt16BE);
  uint32 = this.op(4, Buffer.prototype.readUInt32BE, Buffer.prototype.writeUInt32BE);
  float = this.op(4, Buffer.prototype.readFloatBE, Buffer.prototype.writeFloatBE);
  double = this.op(8, Buffer.prototype.readDoubleBE, Buffer.prototype.writeDoubleBE);

  bool = (k: boolean): boolean => {
    return this.uint8(k ? 1 : 0) !== 0;
  }

  string = (k: string): string => {
    return this.trackLength((length) => {
      if (this.isLoading) {
        return uint8ToStr(this.buff, this.offset, length);
      } else {
        this.offset += strToUint8(k, this.buff, this.offset);
        return k;
      }
    });
  }
}
