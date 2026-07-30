import { act, type ReactNode } from "react";
import ReactDOM from "react-dom/client";

type Root = ReturnType<typeof ReactDOM.createRoot>;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

export async function renderHook<Props, Result>(
  callback: (props: Props) => Result,
  initialProps: Props
): Promise<{
  readonly result: Result;
  rerender: (props: Props) => Promise<void>;
  unmount: () => Promise<void>;
}> {
  const root = ReactDOM.createRoot(document.createElement("div"));
  let result: Result;

  function Host({ props }: { props: Props }): ReactNode {
    result = callback(props);
    return null;
  }

  await render(root, <Host props={initialProps} />);
  return {
    get result() {
      return result;
    },
    rerender: (props) => render(root, <Host props={props} />),
    unmount: () => render(root, null)
  };
}

export async function renderComponent(content: ReactNode): Promise<{
  container: HTMLDivElement;
  unmount: () => Promise<void>;
}> {
  const container = document.createElement("div");
  const root = ReactDOM.createRoot(container);
  await render(root, content);
  return {
    container,
    unmount: () => render(root, null)
  };
}

async function render(root: Root, content: ReactNode): Promise<void> {
  await act(async () => {
    root.render(content);
    await Promise.resolve();
    await Promise.resolve();
  });
}

export async function flushHookEffects(action?: () => unknown): Promise<void> {
  await act(async () => {
    await action?.();
    await Promise.resolve();
    await Promise.resolve();
  });
}
