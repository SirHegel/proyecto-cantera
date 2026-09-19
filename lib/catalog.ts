/**
 * Catálogo del asistente de búsqueda.
 * Agregar un país es una línea. No hay nada más que tocar.
 */

export const NICHOS = [
  "Clínicas dentales",
  "Clínicas estéticas / Med spas",
  "Inmobiliarias",
  "Abogados",
  "Gimnasios y estudios",
  "Coaches y consultores",
  "Climatización / HVAC",
  "Techos / Roofing",
  "Plomería",
  "Agentes inmobiliarios",
] as const;

/**
 * Solo mercados premium. El idioma sugerido se autocompleta al elegir país,
 * pero sigue siendo independiente: Estados Unidos + español es válido y es
 * justo el caso del mercado hispano en Miami o Texas.
 */
export const PAISES = [
  {
    code: "CO",
    label: "Colombia",
    idioma: "es",
    ciudades: ["Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena", "Neiva"],
  },
  {
    code: "MX",
    label: "México",
    idioma: "es",
    ciudades: ["Ciudad de México", "Guadalajara", "Monterrey", "Puebla"],
  },
  {
    code: "AR",
    label: "Argentina",
    idioma: "es",
    ciudades: ["Buenos Aires", "Córdoba", "Rosario"],
  },
  { code: "CL", label: "Chile", idioma: "es", ciudades: ["Santiago", "Valparaíso", "Concepción"] },
  { code: "PE", label: "Perú", idioma: "es", ciudades: ["Lima", "Arequipa", "Trujillo"] },
  { code: "EC", label: "Ecuador", idioma: "es", ciudades: ["Quito", "Guayaquil", "Cuenca"] },
  {
    code: "US",
    label: "Estados Unidos",
    idioma: "en",
    ciudades: ["Miami", "New York", "Los Angeles", "Houston", "Chicago", "Dallas"],
  },
  {
    code: "CA",
    label: "Canadá",
    idioma: "en",
    ciudades: ["Toronto", "Vancouver", "Montreal", "Calgary"],
  },
  {
    code: "GB",
    label: "Reino Unido",
    idioma: "en",
    ciudades: ["London", "Manchester", "Birmingham", "Edinburgh"],
  },
  { code: "IE", label: "Irlanda", idioma: "en", ciudades: ["Dublin", "Cork", "Galway"] },
  {
    code: "AU",
    label: "Australia",
    idioma: "en",
    ciudades: ["Sydney", "Melbourne", "Brisbane", "Perth"],
  },
  {
    code: "NZ",
    label: "Nueva Zelanda",
    idioma: "en",
    ciudades: ["Auckland", "Wellington", "Christchurch"],
  },
  {
    code: "AE",
    label: "Emiratos Árabes",
    idioma: "en",
    ciudades: ["Dubai", "Abu Dhabi", "Sharjah"],
  },
  { code: "SG", label: "Singapur", idioma: "en", ciudades: ["Singapore"] },
  { code: "CH", label: "Suiza", idioma: "en", ciudades: ["Zurich", "Geneva", "Basel"] },
  {
    code: "ES",
    label: "España",
    idioma: "es",
    ciudades: ["Madrid", "Barcelona", "Valencia", "Sevilla", "Málaga", "Bilbao"],
  },
] as const;

export const IDIOMAS = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
] as const;

export const CANTIDADES = [25, 50, 100] as const;

export function paisLabel(code: string): string {
  return PAISES.find((p) => p.code === code)?.label ?? code;
}

export function idiomaSugerido(code: string): "es" | "en" {
  return (PAISES.find((p) => p.code === code)?.idioma ?? "en") as "es" | "en";
}

/** Texto del lugar para la consulta y para la pantalla. Ciudad es opcional. */
export function lugarLabel(country: string, city?: string | null): string {
  return city?.trim() ? `${city.trim()}, ${paisLabel(country)}` : `todo ${paisLabel(country)}`;
}

/** Nombre del país para titulares cuando no hay ciudad. */
export const paisSolo = paisLabel;
