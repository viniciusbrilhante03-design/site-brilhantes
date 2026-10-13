import { Input } from "@/components/ui/input";

const fmt = (n) =>
  n === "" || n === null || n === undefined || isNaN(Number(n))
    ? ""
    : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Máscara de moeda BR: usuário digita dígitos, interpreta como centavos.
// Ex: "4000000" -> 40.000,00 ; valor armazenado é número (40000).
export function CurrencyInput({ value, onChange, ...props }) {
  const handle = (e) => {
    const digits = (e.target.value || "").replace(/\D/g, "");
    onChange(digits ? parseInt(digits, 10) / 100 : "");
  };
  return <Input inputMode="numeric" value={fmt(value)} onChange={handle} {...props} />;
}
