import { Stream, stream } from '../../stream/Stream';
import Arbitrary from '../arbitrary/definition/Arbitrary';
import Shrinkable from '../arbitrary/definition/Shrinkable';
import { ObjectEntries, StringPadEnd, StringPadStart } from '../polyfills';
import IProperty from '../property/IProperty';
import { Property } from '../property/Property';
import { UnbiasedProperty } from '../property/UnbiasedProperty';
import { Parameters } from './configuration/Parameters';
import { QualifiedParameters } from './configuration/QualifiedParameters';
import toss from './Tosser';
import { pathWalk } from './utils/PathWalker';

/** @hidden */
function toProperty<Ts>(generator: IProperty<Ts> | Arbitrary<Ts>, qParams: QualifiedParameters<Ts>): IProperty<Ts> {
  const prop = !generator.hasOwnProperty('isAsync')
    ? new Property(generator as Arbitrary<Ts>, () => true)
    : (generator as IProperty<Ts>);
  return qParams.unbiased === true ? new UnbiasedProperty(prop) : prop;
}

/** @hidden */
function streamSample<Ts>(
  generator: IProperty<Ts> | Arbitrary<Ts>,
  params?: Parameters<Ts> | number
): IterableIterator<Ts> {
  const qParams: QualifiedParameters<Ts> = QualifiedParameters.readOrNumRuns(params);
  const tossedValues: Stream<() => Shrinkable<Ts>> = stream(
    toss(toProperty(generator, qParams), qParams.seed, qParams.examples)
  );
  if (qParams.path.length === 0) {
    return tossedValues.take(qParams.numRuns).map(s => s().value);
  }
  return stream(pathWalk(qParams.path, tossedValues.map(s => s())))
    .take(qParams.numRuns)
    .map(s => s.value);
}

/**
 * Generate an array containing all the values that would have been generated during {@link assert} or {@link check}
 *
 * @example
 * ```typescript
 * fc.sample(fc.nat(), 10); // extract 10 values from fc.nat() Arbitrary
 * fc.sample(fc.nat(), {seed: 42}); // extract values from fc.nat() as if we were running fc.assert with seed=42
 * ```
 *
 * @param generator {@link IProperty} or {@link Arbitrary} to extract the values from
 * @param params Integer representing the number of values to generate or {@link Parameters} as in {@link assert}
 */
function sample<Ts>(generator: IProperty<Ts> | Arbitrary<Ts>, params?: Parameters<Ts> | number): Ts[] {
  return [...streamSample(generator, params)];
}

/**
 * Gather useful statistics concerning generated values
 *
 * Print the result in `console.log` or `params.logger` (if defined)
 *
 * @example
 * ```typescript
 * fc.statistics(
 *     fc.nat(999),
 *     v => v < 100 ? 'Less than 100' : 'More or equal to 100',
 *     {numRuns: 1000, logger: console.log});
 * // Classify 1000 values generated by fc.nat(999) into two categories:
 * // - Less than 100
 * // - More or equal to 100
 * // The output will be sent line by line to the logger
 * ```
 *
 * @param generator {@link IProperty} or {@link Arbitrary} to extract the values from
 * @param classify Classifier function that can classify the generated value in zero, one or more categories (with free labels)
 * @param params Integer representing the number of values to generate or {@link Parameters} as in {@link assert}
 */
function statistics<Ts>(
  generator: IProperty<Ts> | Arbitrary<Ts>,
  classify: (v: Ts) => string | string[],
  params?: Parameters<Ts> | number
): void {
  const qParams = QualifiedParameters.readOrNumRuns(params);
  const recorded: { [key: string]: number } = {};
  for (const g of streamSample(generator, params)) {
    const out = classify(g);
    const categories: string[] = Array.isArray(out) ? out : [out];
    for (const c of categories) {
      recorded[c] = (recorded[c] || 0) + 1;
    }
  }
  const data = ObjectEntries(recorded)
    .sort((a, b) => b[1] - a[1])
    .map(i => [i[0], `${((i[1] * 100.0) / qParams.numRuns).toFixed(2)}%`]);
  const longestName = data.map(i => i[0].length).reduce((p, c) => Math.max(p, c), 0);
  const longestPercent = data.map(i => i[1].length).reduce((p, c) => Math.max(p, c), 0);
  for (const item of data) {
    qParams.logger(`${StringPadEnd(item[0], longestName, '.')}..${StringPadStart(item[1], longestPercent, '.')}`);
  }
}

export { sample, statistics };
