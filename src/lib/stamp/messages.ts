// Traduce el resultado de grant_stamp a texto para el cliente. La regla de negocio vive en
// la base (1 sello por día, claim de un solo uso); aquí solo se presenta.

export type StampOutcome = {
  claim_result: string;
  stamps_count: number;
  stamps_target: number;
  reward: string;
};

export type StampMessage = {
  tone: 'success' | 'info' | 'warning';
  title: string;
  detail: string;
};

export function describeStampOutcome(outcome: StampOutcome): StampMessage {
  const { claim_result, stamps_count, stamps_target, reward } = outcome;
  const progress = `Llevas ${stamps_count} de ${stamps_target}.`;
  const won = stamps_count >= stamps_target;

  switch (claim_result) {
    case 'granted':
      if (won) {
        return {
          tone: 'success',
          title: '¡Ya ganaste tu premio!',
          detail: `${reward}. Sello ${stamps_count} de ${stamps_target}.`,
        };
      }
      return {
        tone: 'success',
        title: `¡Sello ${stamps_count} de ${stamps_target}!`,
        detail: `Te faltan ${stamps_target - stamps_count} para: ${reward}.`,
      };
    case 'already_today':
      return {
        tone: 'info',
        title: 'Ya sumaste tu sello de hoy',
        detail: won ? `Ya ganaste tu premio: ${reward}.` : progress,
      };
    case 'expired':
      return {
        tone: 'warning',
        title: 'Este sello venció',
        detail: 'Acerca tu celular al sello otra vez.',
      };
    default:
      return unavailable();
  }
}

export function unavailable(): StampMessage {
  return {
    tone: 'warning',
    title: 'No pudimos registrar tu sello',
    detail: 'Acerca tu celular al sello otra vez.',
  };
}

// Mensajes de los rechazos que ocurren antes de /sello (/t y /q), por ?estado=…
const ERROR_MESSAGES: Record<string, StampMessage> = {
  reintentar: {
    tone: 'warning',
    title: 'Acerca tu celular al sello otra vez',
    detail: 'Ese toque ya se usó. Vuelve a acercarlo al sello.',
  },
  invalido: {
    tone: 'warning',
    title: 'No pudimos validar el sello',
    detail: 'Acerca tu celular al sello otra vez.',
  },
  'qr-vencido': {
    tone: 'warning',
    title: 'Este QR ya venció',
    detail: 'Pide al personal de caja que muestre el QR otra vez.',
  },
  'qr-invalido': {
    tone: 'warning',
    title: 'Este QR no es válido o ya se usó',
    detail: 'Pide al personal de caja que muestre el QR otra vez.',
  },
};

export function describeStampError(estado: string | undefined) {
  return estado ? (ERROR_MESSAGES[estado] ?? null) : null;
}

export const NO_CLAIM_MESSAGE: StampMessage = {
  tone: 'info',
  title: 'Acerca tu celular al sello',
  detail: 'Toca el sello de la caja para sumar tu visita.',
};
