import type { ReactNode } from "react";
const names: Record<string, string> = {
  input_connector: "Input connector",
  output_connector: "Output connector",
  protocols: "Charging protocols",
  max_output_w: "Maximum power",
  power_profiles: "Voltage / current profiles",
  cable_included: "Cable",
  cable_length_m: "Cable length",
  capacity_mah: "Battery capacity",
  capacity_wh: "Energy capacity",
  nominal_voltage_v: "Nominal voltage",
};
const title = (s: string) => names[s] ?? s.replaceAll("_", " ");
function valueView(key: string, value: unknown): ReactNode {
  if (value === null || value === undefined) return "Not specified";
  if (typeof value === "boolean")
    return key === "cable_included"
      ? value
        ? "Cable included"
        : "Cable not included"
      : value
        ? "Yes"
        : "No";
  if (Array.isArray(value)) {
    if (key === "power_profiles")
      return (
        <table className="power-profiles">
          <caption className="sr-only">
            Verified charger output profiles
          </caption>
          <thead>
            <tr>
              <th>Voltage</th>
              <th>Current</th>
            </tr>
          </thead>
          <tbody>
            {value.map((row, i) => {
              const p = row as Record<string, unknown>;
              return (
                <tr key={i}>
                  <td>{String(p.volts ?? "Not specified")} V</td>
                  <td>{String(p.amps ?? "Not specified")} A</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    if (value.every((v) => ["string", "number"].includes(typeof v)))
      return value.length ? value.map(String).join(", ") : "None specified";
    return (
      <ul>
        {value.map((v, i) => (
          <li key={i}>{valueView(key, v)}</li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object")
    return (
      <dl>
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            <dt>{title(k)}</dt>
            <dd>{valueView(k, v)}</dd>
          </div>
        ))}
      </dl>
    );
  const unit: Record<string, string> = {
    max_output_w: " W",
    cable_length_m: " m",
    capacity_mah: " mAh",
    capacity_wh: " Wh",
    nominal_voltage_v: " V",
    volts: " V",
    amps: " A",
  };
  return `${String(value)}${unit[key] ?? ""}`;
}
export default function Specifications({
  values,
}: {
  values: Record<string, unknown>;
}) {
  return Object.keys(values).length ? (
    <dl className="spec-list">
      {Object.entries(values).map(([key, value]) => (
        <div
          key={key}
          className={key === "power_profiles" ? "spec-profile-row" : undefined}
        >
          <dt>{title(key)}</dt>
          <dd>{valueView(key, value)}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <p>No verified specifications have been provided.</p>
  );
}
