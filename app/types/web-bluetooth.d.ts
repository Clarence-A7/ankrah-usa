// Minimal Web Bluetooth API type declarations.
//
// The ESC/POS label printer (app/lib/escpos-printer.ts) talks to a BLE thermal
// printer via `navigator.bluetooth`, which the standard TS DOM lib does not
// type. This declares only the surface that file uses. For the full API you can
// instead install `@types/web-bluetooth`; this keeps the build self-contained.
//
// No top-level import/export → this file is a global (ambient) script, so the
// `Navigator` augmentation below merges with the built-in lib.dom definition.

interface BluetoothRemoteGATTCharacteristic {
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(
    characteristic: string | number,
  ): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(
    service: string | number,
  ): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice extends EventTarget {
  readonly gatt?: BluetoothRemoteGATTServer;
}

interface BluetoothLEScanFilter {
  services?: (string | number)[];
  name?: string;
  namePrefix?: string;
}

interface RequestDeviceOptions {
  filters?: BluetoothLEScanFilter[];
  optionalServices?: (string | number)[];
  acceptAllDevices?: boolean;
}

interface Bluetooth {
  requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
}

interface Navigator {
  readonly bluetooth: Bluetooth;
}
