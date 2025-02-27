import * as fc from '../../../lib/fast-check';
import { dictionary, DictionaryConstraints } from '../../../src/arbitrary/dictionary';

import { convertFromNext, convertToNext } from '../../../src/check/arbitrary/definition/Converters';
import { NextArbitrary } from '../../../src/check/arbitrary/definition/NextArbitrary';
import { NextValue } from '../../../src/check/arbitrary/definition/NextValue';
import { Random } from '../../../src/random/generator/Random';
import { Stream } from '../../../src/stream/Stream';
import {
  assertProduceSameValueGivenSameSeed,
  assertProduceCorrectValues,
  assertProduceValuesShrinkableWithoutContext,
} from './__test-helpers__/NextArbitraryAssertions';

describe('dictionary (integration)', () => {
  type Extra = { keys: string[]; values: unknown[]; constraints?: DictionaryConstraints };
  const extraParameters: fc.Arbitrary<Extra> = fc.record(
    {
      keys: fc.set(fc.string(), { minLength: 35 }), // enough keys to respect constraints
      values: fc.set(fc.anything(), { minLength: 1 }),
      constraints: fc
        .tuple(fc.nat({ max: 5 }), fc.nat({ max: 30 }), fc.boolean(), fc.boolean())
        .map(([min, gap, withMin, withMax]) => ({
          minKeys: withMin ? min : undefined,
          maxKeys: withMax ? min + gap : undefined,
        })),
    },
    { requiredKeys: ['keys', 'values'] }
  );

  const isCorrect = (value: Record<string, unknown>, extra: Extra) => {
    expect(value.constructor).toBe(Object);
    expect(value.__proto__).toBe(Object.prototype);
    for (const k of Object.keys(value)) {
      expect(extra.keys).toContain(k);
    }
    for (const v of Object.values(value)) {
      if (Number.isNaN(v)) expect(extra.values.includes(v)).toBe(true);
      else expect(extra.values).toContain(v); // exact same value (not a copy)
    }
    if (extra.constraints !== undefined) {
      if (extra.constraints.minKeys !== undefined) {
        expect(Object.keys(value).length).toBeGreaterThanOrEqual(extra.constraints.minKeys);
      }
      if (extra.constraints.maxKeys !== undefined) {
        expect(Object.keys(value).length).toBeLessThanOrEqual(extra.constraints.maxKeys);
      }
    }
  };

  const dictionaryBuilder = (extra: Extra) => {
    const keyArb = convertFromNext(new FromValuesArbitrary(extra.keys));
    const valueArb = convertFromNext(new FromValuesArbitrary(extra.values));
    const constraints = extra.constraints;
    return convertToNext(dictionary(keyArb, valueArb, constraints));
  };

  it('should produce the same values given the same seed', () => {
    assertProduceSameValueGivenSameSeed(dictionaryBuilder, { extraParameters });
  });

  it('should only produce correct values', () => {
    assertProduceCorrectValues(dictionaryBuilder, isCorrect, { extraParameters });
  });

  it('should produce values seen as shrinkable without any context (if underlyings do)', () => {
    assertProduceValuesShrinkableWithoutContext(dictionaryBuilder, { extraParameters });
  });
});

// Helpers

class FromValuesArbitrary<T> extends NextArbitrary<T> {
  constructor(readonly source: T[]) {
    super();
  }
  generate(mrng: Random, _biasFactor: number): NextValue<T> {
    const index = mrng.nextInt(0, this.source.length - 1);
    return new NextValue(this.source[index], undefined);
  }
  canShrinkWithoutContext(value: unknown): value is T {
    // includes might mix 0 and -0
    return this.source.includes(value as any);
  }
  shrink(_value: T, _context?: unknown): Stream<NextValue<T>> {
    return Stream.nil();
  }
}
