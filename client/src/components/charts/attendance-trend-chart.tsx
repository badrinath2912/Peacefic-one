'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { TrendPoint } from '@/api/queries';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatPercent } from '@/lib/utils';

interface Props {
  data: TrendPoint[];
  isLoading?: boolean;
}

export function AttendanceTrendChart({ data, isLoading }: Props) {
  if (isLoading) return <div className="skeleton h-64 w-full" />;

  if (data.length === 0) {
    return (
      <EmptyState
        title="No attendance recorded yet"
        description="Once sessions are marked, the trend appears here."
      />
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="attendanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Horizontal only: vertical gridlines add clutter without helping
              read a value off the y-axis. */}
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />

          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(value: string) =>
              new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
            }
            minTickGap={24}
          />

          <YAxis
            domain={[0, 100]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(value: number) => `${value}%`}
            width={44}
          />

          <Tooltip
            cursor={{ stroke: 'hsl(var(--border))' }}
            contentStyle={{
              borderRadius: 8,
              border: '1px solid hsl(var(--border))',
              background: 'hsl(var(--popover))',
              color: 'hsl(var(--popover-foreground))',
              fontSize: 12,
            }}
            labelFormatter={(value: string) => formatDate(value)}
            formatter={(value: number, _name, item) => {
              const point = item.payload as TrendPoint;
              return [`${formatPercent(value)} (${point.present}/${point.total})`, 'Attendance'];
            }}
          />

          <Area
            type="monotone"
            dataKey="percentage"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#attendanceFill)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
