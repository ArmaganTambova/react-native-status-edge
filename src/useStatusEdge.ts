import { useEffect, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import type { StatusEdgeData } from './types';

const LINKING_ERROR =
  `The package 'react-native-status-edge' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

// @ts-expect-error
const isTurboModuleEnabled = global.__turboModuleProxy != null;

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
    async function load() {
      try {
        const json = await StatusEdge.getCutoutData();
        const parsed = JSON.parse(json);
        setData(parsed);
      } catch (e) {
        console.error('Failed to load status edge data', e);
      }
    }
    load();
  }, []);

  return data;
}

export default StatusEdge;
