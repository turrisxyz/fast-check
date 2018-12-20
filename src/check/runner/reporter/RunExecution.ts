import { VerbosityLevel } from '../configuration/VerbosityLevel';
import { ExecutionStatus } from './ExecutionStatus';
import { ExecutionTree } from './ExecutionTree';
import { RunDetails } from './RunDetails';

/**
 * @hidden
 *
 * Report the status of a run
 *
 * It receives notification from the runner in case of failures
 */
export class RunExecution<Ts> {
  readonly rootExecutionTrees: ExecutionTree<Ts>[];
  currentLevelExecutionTrees: ExecutionTree<Ts>[];
  pathToFailure?: string;
  value?: Ts;
  failure: string;
  numSkips: number;
  numSuccesses: number;

  constructor(readonly verbosity: VerbosityLevel) {
    this.rootExecutionTrees = [];
    this.currentLevelExecutionTrees = this.rootExecutionTrees;
    this.numSkips = 0;
    this.numSuccesses = 0;
  }

  fail(value: Ts, id: number, message: string) {
    if (this.verbosity >= VerbosityLevel.Verbose) {
      const currentTree: ExecutionTree<Ts> = {
        status: ExecutionStatus.Failure,
        value,
        children: []
      };
      this.currentLevelExecutionTrees.push(currentTree);
      this.currentLevelExecutionTrees = currentTree.children;
    }
    if (this.pathToFailure == null) this.pathToFailure = `${id}`;
    else this.pathToFailure += `:${id}`;
    this.value = value;
    this.failure = message;
  }
  skip() {
    if (this.pathToFailure == null) {
      ++this.numSkips;
    }
  }
  success() {
    if (this.pathToFailure == null) {
      ++this.numSuccesses;
    }
  }

  private isSuccess = (): boolean => this.pathToFailure == null;
  private firstFailure = (): number => (this.pathToFailure ? +this.pathToFailure.split(':')[0] : -1);
  private numShrinks = (): number => (this.pathToFailure ? this.pathToFailure.split(':').length - 1 : 0);

  private extractFailures() {
    if (this.isSuccess()) {
      return [];
    }
    const failures: Ts[] = [];
    let cursor = this.rootExecutionTrees;
    while (cursor.length > 0 && cursor[cursor.length - 1].status === ExecutionStatus.Failure) {
      const failureTree = cursor[cursor.length - 1];
      failures.push(failureTree.value);
      cursor = failureTree.children;
    }
    return failures;
  }

  private static mergePaths = (offsetPath: string, path: string) => {
    if (offsetPath.length === 0) return path;
    const offsetItems = offsetPath.split(':');
    const remainingItems = path.split(':');
    const middle = +offsetItems[offsetItems.length - 1] + +remainingItems[0];
    return [...offsetItems.slice(0, offsetItems.length - 1), `${middle}`, ...remainingItems.slice(1)].join(':');
  };

  toRunDetails(seed: number, basePath: string, numRuns: number, maxSkips: number): RunDetails<Ts> {
    if (!this.isSuccess()) {
      // encountered a property failure
      return {
        failed: true,
        numRuns: this.firstFailure() + 1 - this.numSkips,
        numSkips: this.numSkips,
        numShrinks: this.numShrinks(),
        seed,
        counterexample: this.value!,
        counterexamplePath: RunExecution.mergePaths(basePath, this.pathToFailure!),
        error: this.failure,
        failures: this.extractFailures()
      };
    }
    if (this.numSkips > maxSkips) {
      // too many skips
      return {
        failed: true,
        numRuns: this.numSuccesses,
        numSkips: this.numSkips,
        numShrinks: 0,
        seed,
        counterexample: null,
        counterexamplePath: null,
        error: null,
        failures: []
      };
    }
    return {
      failed: false,
      numRuns,
      numSkips: this.numSkips,
      numShrinks: 0,
      seed,
      counterexample: null,
      counterexamplePath: null,
      error: null,
      failures: []
    };
  }
}
