export class DraftSaveQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}
