import type { Transport } from './card';

// Transporte PC/SC para el lector ACR1252U. @pokusew/pcsclite es una dependencia opcional
// (módulo nativo): se importa en tiempo de ejecución para que el CI y las pruebas no la
// necesiten. En Linux requiere libpcsclite-dev y el servicio pcscd.

type PcscReader = {
  name: string;
  state: number;
  SCARD_STATE_PRESENT: number;
  SCARD_SHARE_SHARED: number;
  on(event: string, listener: (...args: never[]) => void): void;
  connect(
    options: { share_mode: number },
    callback: (error: Error | null, protocol: number) => void,
  ): void;
  transmit(
    data: Buffer,
    maxLength: number,
    protocol: number,
    callback: (error: Error | null, response: Buffer) => void,
  ): void;
  close(): void;
};

type PcscContext = {
  on(event: 'reader', listener: (reader: PcscReader) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  close(): void;
};

export type Connection = { transport: Transport; close(): void };

// Espera un tag sobre el lector y devuelve el transporte. Rechaza si pasan `timeoutMs`.
export async function connectToTag(timeoutMs = 60_000): Promise<Connection> {
  const moduleName = '@pokusew/pcsclite';
  let factory: () => PcscContext;
  try {
    const loaded = (await import(moduleName)) as {
      default?: () => PcscContext;
    };
    factory = loaded.default ?? (loaded as unknown as () => PcscContext);
  } catch {
    throw new Error(
      'Falta @pokusew/pcsclite (módulo nativo). Ejecuta `pnpm approve-builds` y `pnpm rebuild @pokusew/pcsclite`; en Linux instala libpcsclite-dev.',
    );
  }

  const pcsc = factory();
  return new Promise<Connection>((resolve, reject) => {
    const timer = setTimeout(() => {
      pcsc.close();
      reject(new Error('Tiempo agotado: no se detectó un tag sobre el lector'));
    }, timeoutMs);

    pcsc.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    pcsc.on('reader', (reader) => {
      reader.on('error', (() => undefined) as never);
      reader.on('status', ((status: { state: number }) => {
        const changes = reader.state ^ status.state;
        const present =
          (changes & reader.SCARD_STATE_PRESENT) !== 0 &&
          (status.state & reader.SCARD_STATE_PRESENT) !== 0;
        reader.state = status.state;
        if (!present) return;

        reader.connect(
          { share_mode: reader.SCARD_SHARE_SHARED },
          (error, protocol) => {
            clearTimeout(timer);
            if (error) return reject(error);
            resolve({
              transport: {
                transmit: (apdu) =>
                  new Promise((ok, fail) =>
                    reader.transmit(apdu, 512, protocol, (err, response) =>
                      err ? fail(err) : ok(response),
                    ),
                  ),
              },
              close() {
                reader.close();
                pcsc.close();
              },
            });
          },
        );
      }) as never);
    });
  });
}
