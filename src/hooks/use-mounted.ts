import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

function getSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

/** True once the component has hydrated on the client. Avoids SSR/CSR mismatches for
 * client-only state (e.g. resolved theme) without calling setState inside an effect. */
export function useMounted() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
