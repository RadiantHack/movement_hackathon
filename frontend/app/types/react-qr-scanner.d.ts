declare module "react-qr-scanner" {
  import * as React from "react";

  export interface QrScannerProps {
    onScan: (result: { text: string }) => void;
    onError?: (error: Error | any) => void;
    constraints?: MediaStreamConstraints;
    containerStyle?: React.CSSProperties;
    videoStyle?: React.CSSProperties;
  }

  export class QrScanner extends React.Component<QrScannerProps> {}
}

