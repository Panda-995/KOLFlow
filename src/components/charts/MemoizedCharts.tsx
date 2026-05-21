import { memo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';

interface ChartData {
  name: string;
  [key: string]: string | number;
}

interface AreaChartComponentProps {
  data: ChartData[];
  dataKey: string;
  strokeColor?: string;
  fillId?: string;
  height?: number;
}

export const AreaChartComponent = memo(function AreaChartComponent({
  data,
  dataKey,
  strokeColor = '#09090b',
  fillId = 'colorChart',
  height = 300
}: AreaChartComponentProps) {
  return (
    <div style={{ width: '100%', minWidth: 0, height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={strokeColor} stopOpacity={0.1} />
              <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E0E0E0" />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
            dx={-10}
          />
          <Tooltip
            contentStyle={{
              borderRadius: '12px',
              border: 'none',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
              padding: '12px'
            }}
            itemStyle={{ color: '#1A1A1A', fontWeight: 600 }}
            cursor={{ stroke: strokeColor, strokeWidth: 1, strokeDasharray: '4 4' }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={strokeColor}
            strokeWidth={3}
            fillOpacity={1}
            fill={`url(#${fillId})`}
            dot={{ r: 4, fill: strokeColor, strokeWidth: 2, stroke: '#FFFFFF' }}
            activeDot={{ r: 6, fill: strokeColor, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

interface LineChartComponentProps {
  data: ChartData[];
  lines: { dataKey: string; stroke: string; yAxisId?: string }[];
  height?: number;
}

export const LineChartComponent = memo(function LineChartComponent({
  data,
  lines,
  height = 300
}: LineChartComponentProps) {
  return (
    <div style={{ width: '100%', minWidth: 0, height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E0E0E0" />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#9CA3AF' }}
            dy={10}
          />
          {lines.some(l => l.yAxisId === 'right') ? (
            <>
              <YAxis
                yAxisId="left"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9CA3AF' }}
                dx={-10}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9CA3AF' }}
                dx={10}
              />
            </>
          ) : (
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} dx={-10} />
          )}
          <Tooltip
            contentStyle={{
              borderRadius: '12px',
              border: 'none',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}
          />
          <Legend />
          {lines.map((line, index) => (
            <Line
              key={index}
              yAxisId={line.yAxisId || 'left'}
              type="monotone"
              dataKey={line.dataKey}
              stroke={line.stroke}
              strokeWidth={2}
              dot={{ fill: line.stroke }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

const COLORS = ['#09090b', '#27272a', '#52525b', '#a1a1aa', '#d4d4d8', '#71717a'];

interface PieChartComponentProps {
  data: { name: string; value: number; percentage?: number }[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
}

export const PieChartComponent = memo(function PieChartComponent({
  data,
  height = 240,
  innerRadius = 60,
  outerRadius = 90
}: PieChartComponentProps) {
  return (
    <div style={{ width: '100%', minWidth: 0, height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={5}
            dataKey="value"
            stroke="none"
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: '12px',
              border: 'none',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}
            formatter={(value, name, props) => [
              `${value}单 (${props.payload.percentage}%)`,
              name
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
});

interface BarChartComponentProps {
  data: { name: string; value: number; color?: string }[];
  height?: number;
  layout?: 'vertical' | 'horizontal';
}

export const BarChartComponent = memo(function BarChartComponent({
  data,
  height = 200,
  layout = 'vertical'
}: BarChartComponentProps) {
  return (
    <div style={{ width: '100%', minWidth: 0, height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} layout={layout}>
          <CartesianGrid strokeDasharray="3 3" horizontal={layout === 'vertical'} />
          {layout === 'vertical' ? (
            <>
              <XAxis type="number" axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={60} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} />
            </>
          )}
          <Tooltip
            contentStyle={{
              borderRadius: '12px',
              border: 'none',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}
          />
          <Bar dataKey="value" radius={layout === 'vertical' ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
