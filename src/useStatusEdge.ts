import { useEffect, useState } from 'react';
import { Dimensions, NativeModules, Platform } from 'react-native';
import type { StatusEdgeData } from './types';

const LINKING_ERROR =
  `The package 'react-native-status-edge' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const isTurboModuleEnabled =
  (global as { __turboModuleProxy?: unknown }).__turboModuleProxy != null;

const StatusEdgeModule = isTurboModuleEnabled
  ? require('./NativeStatusEdge').default
  : NativeModules.StatusEdge;

const StatusEdge = StatusEdgeModule
  ? StatusEdgeModule
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

export function useStatusEdge(): StatusEdgeData | null {
  const [data, setData] = useState<StatusEdgeData | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const json = await StatusEdge.getCutoutData();
        const parsed = JSON.parse(json) as StatusEdgeData;
        if (mounted) setData(parsed);
      } catch (e) {
        if (__DEV__) {
          console.warn(
            'react-native-status-edge: failed to load cutout data',
            e
          );
        }
      }
    }

    load();
    // Cutout geometry depends on orientation / window size, so refetch when it
    // changes — otherwise the overlay stays aligned to the original layout.
    const subscription = Dimensions.addEventListener('change', load);

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return data;
}

export default StatusEdge;
