"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { InventoryAnalytics } from "@/lib/analytics/inventory";

const COLORS = ["#dc2626", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2", "#be185d", "#65a30d"];

const FUEL_LABEL: Record<string, string> = {
  PETROL:   "Petrol",
  DIESEL:   "Diesel",
  CNG:      "CNG",
  ELECTRIC: "Electric",
  HYBRID:   "Hybrid",
};

const VEHICLE_LABEL: Record<string, string> = {
  CAR:  "Cars",
  BIKE: "Bikes",
};

interface Props {
  inventory: InventoryAnalytics;
}

export function InventoryCharts({ inventory }: Props) {
  const fuelData = inventory.byFuelType.map((b) => ({
    name: FUEL_LABEL[b.label] ?? b.label,
    value: b.count,
  }));

  const vehicleData = inventory.byVehicleType.map((b) => ({
    name: VEHICLE_LABEL[b.label] ?? b.label,
    value: b.count,
  }));

  const makeData = inventory.byMake.map((b) => ({ name: b.label, value: b.count }));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <MiniDonut title="Vehicle type" data={vehicleData} />
      <MiniDonut title="Fuel type" data={fuelData} />
      <div className="border-border-default bg-background rounded-lg border p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Top brands
        </h2>
        {makeData.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-zinc-400">
            No data yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={170}>
            <BarChart
              layout="vertical"
              data={makeData}
              margin={{ top: 0, right: 4, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fontSize: 11, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #e4e4e7",
                }}
              />
              <Bar dataKey="value" fill="#dc2626" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function MiniDonut({
  title,
  data,
}: {
  title: string;
  data: { name: string; value: number }[];
}) {
  return (
    <div className="border-border-default bg-background rounded-lg border p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      {data.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-zinc-400">
          No data yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={170}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="45%"
              innerRadius={42}
              outerRadius={62}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #e4e4e7",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
        {data.map((d, i) => (
          <span key={d.name} className="flex items-center gap-1 text-xs text-zinc-500">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            {d.name}
          </span>
        ))}
      </div>
    </div>
  );
}
