import 'server-only';

import QRCode from 'qrcode';
import { logServerError } from '@/lib/http';

/**
 * Renders a QR code to a data URI on the server.
 *
 * Keeping this server-side means the `qrcode` library never reaches the
 * browser bundle, and the ticket component stays a plain `<img>`.
 */
export async function renderQrDataUrl(value: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
      color: { dark: '#04050e', light: '#ffffff' },
    });
  } catch (error) {
    // A missing QR is a cosmetic loss; the ticket id is printed beside it.
    logServerError('qr: failed to render', error);
    return null;
  }
}
