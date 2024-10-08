import type { FC, PropsWithChildren } from "react";
import { useEffect, useInsertionEffect, useState } from "react";
import type { ReactThreadRuntime } from "../../runtimes/core/ReactThreadRuntime";
import type { ThreadContextValue } from "../react/ThreadContext";
import { ThreadContext } from "../react/ThreadContext";
import { ComposerState, makeComposerStore } from "../stores/Composer";
import {
  ThreadState,
  getThreadStateFromRuntime,
  makeThreadStore,
} from "../stores/Thread";
import { makeThreadViewportStore } from "../stores/ThreadViewport";
import { makeThreadActionStore } from "../stores/ThreadActions";
import { StoreApi } from "zustand";
import {
  ThreadMessagesState,
  makeThreadMessagesStore,
} from "../stores/ThreadMessages";
import { ThreadRuntimeWithSubscribe } from "../../runtimes/core/AssistantRuntime";
import {
  makeThreadRuntimeStore,
  ThreadRuntimeStore,
} from "../stores/ThreadRuntime";
import { subscribeToMainThread } from "../../runtimes";

type ThreadProviderProps = {
  provider: ThreadRuntimeWithSubscribe;
};

export const ThreadProvider: FC<PropsWithChildren<ThreadProviderProps>> = ({
  children,
  provider,
}) => {
  const [context] = useState<ThreadContextValue>(() => {
    const useThreadRuntime = makeThreadRuntimeStore(provider.thread);
    const useThread = makeThreadStore(useThreadRuntime);
    const useThreadMessages = makeThreadMessagesStore(useThreadRuntime);
    const useThreadActions = makeThreadActionStore(useThreadRuntime);
    const useViewport = makeThreadViewportStore();
    const useComposer = makeComposerStore(useThreadRuntime);

    return {
      useThread,
      useThreadRuntime,
      useThreadMessages,
      useThreadActions,
      useComposer,
      useViewport,
    };
  });

  // TODO it might make sense to move this into the make* functions
  useEffect(() => {
    const onThreadUpdate = () => {
      const thread = provider.thread;

      const oldState = context.useThread.getState();
      const state = getThreadStateFromRuntime(thread);
      if (
        oldState.isDisabled !== state.isDisabled ||
        oldState.isRunning !== state.isRunning ||
        // TODO ensure capabilities is memoized
        oldState.capabilities !== state.capabilities
      ) {
        (context.useThread as unknown as StoreApi<ThreadState>).setState(
          state,
          true,
        );
      }

      if (thread.messages !== context.useThreadMessages.getState()) {
        (
          context.useThreadMessages as unknown as StoreApi<ThreadMessagesState>
        ).setState(thread.messages, true);
      }

      const composerState = context.useComposer.getState();
      if (
        thread.composer.text !== composerState.text ||
        state.capabilities.cancel !== composerState.canCancel
      ) {
        (context.useComposer as unknown as StoreApi<ComposerState>).setState({
          text: thread.composer.text,
          canCancel: state.capabilities.cancel,
        });
      }
    };

    onThreadUpdate();
    return subscribeToMainThread(provider, onThreadUpdate);
  }, [provider, context]);

  useInsertionEffect(
    () =>
      provider.subscribe(() => {
        (
          context.useThreadRuntime as unknown as StoreApi<ThreadRuntimeStore>
        ).setState(provider.thread, true);
      }),
    [provider, context],
  );

  // subscribe to thread updates
  const Synchronizer = context.useThreadRuntime(
    (t) => (t as ReactThreadRuntime).unstable_synchronizer,
  );

  return (
    <ThreadContext.Provider value={context}>
      {Synchronizer && <Synchronizer />}
      {children}
    </ThreadContext.Provider>
  );
};
