import type { zh } from './zh'

export const es = {
  setHomeKinds: 'Documentos nuevos en Inicio',
  setHomeKindsDesc:
    'Los tipos desactivados dejan de aparecer en las tarjetas de documento nuevo de Inicio y en los menús Nuevo. Los archivos de esos tipos se siguen abriendo igual.',
  homeKindUp: 'Subir {name}',
  homeKindDown: 'Bajar {name}',
  homeKindsReset: 'Restaurar el orden original',
} satisfies Record<keyof typeof zh, string>
