import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateAchievementImage } from './formData.js';

describe('validateAchievementImage', () => {
  const MAX_SIZE = 12 * 1024 * 1024;

  it('should return the image if it is a valid JPEG', () => {
    const file = new File(['a'], 'test.jpg', { type: 'image/jpeg' });
    assert.strictEqual(validateAchievementImage(file), file);
  });

  it('should return the image if it is a valid PNG', () => {
    const file = new File(['a'], 'test.png', { type: 'image/png' });
    assert.strictEqual(validateAchievementImage(file), file);
  });

  it('should return the image if it is a valid WebP', () => {
    const file = new File(['a'], 'test.webp', { type: 'image/webp' });
    assert.strictEqual(validateAchievementImage(file), file);
  });

  it('should return the image if it is a valid AVIF', () => {
    const file = new File(['a'], 'test.avif', { type: 'image/avif' });
    assert.strictEqual(validateAchievementImage(file), file);
  });

  it('should throw TypeError if image is not a File object', () => {
    assert.throws(() => validateAchievementImage(null), {
      name: 'TypeError',
      message: 'La imagen no es un archivo válido.'
    });

    assert.throws(() => validateAchievementImage({ type: 'image/jpeg', size: 10 }), {
      name: 'TypeError',
      message: 'La imagen no es un archivo válido.'
    });

    assert.throws(() => validateAchievementImage('file'), {
      name: 'TypeError',
      message: 'La imagen no es un archivo válido.'
    });
  });

  it('should throw Error if image type is invalid', () => {
    const file = new File(['a'], 'test.gif', { type: 'image/gif' });
    assert.throws(() => validateAchievementImage(file), {
      name: 'Error',
      message: 'La imagen debe ser JPG, PNG, WebP o AVIF.'
    });
  });

  it('should throw Error if image is empty', () => {
    const file = new File([], 'test.jpg', { type: 'image/jpeg' });
    assert.throws(() => validateAchievementImage(file), {
      name: 'Error',
      message: 'La imagen está vacía.'
    });
  });

  it('should throw Error if image size exceeds 12 MB', () => {
    const buffer = new ArrayBuffer(MAX_SIZE + 1);
    const file = new File([buffer], 'test.jpg', { type: 'image/jpeg' });
    assert.throws(() => validateAchievementImage(file), {
      name: 'Error',
      message: 'La imagen supera el límite de 12 MB.'
    });
  });

  it('should pass if image size is exactly 12 MB', () => {
    const buffer = new ArrayBuffer(MAX_SIZE);
    const file = new File([buffer], 'test.jpg', { type: 'image/jpeg' });
    assert.strictEqual(validateAchievementImage(file), file);
  });
});
