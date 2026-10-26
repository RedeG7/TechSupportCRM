import { ArrowDown, ArrowUp } from 'lucide-react';

type MetricCardProps = {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  change: number;
  changeText: string;
  iconBgColor: string;
};

export default function MetricCard({
  title,
  value,
  icon,
  change,
  changeText,
  iconBgColor
}: MetricCardProps) {
  const isPositive = change >= 0;
  
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-neutral-500 text-sm font-medium">{title}</p>
          <p className="text-3xl font-semibold mt-1 text-neutral-700">{value}</p>
        </div>
        <div className={`p-3 ${iconBgColor} rounded-md`}>
          {icon}
        </div>
      </div>
      <div className="flex items-center mt-4">
        <span className={`${isPositive ? 'text-secondary' : 'text-error'} text-sm font-medium flex items-center`}>
          {isPositive ? <ArrowUp className="mr-1 w-4 h-4" /> : <ArrowDown className="mr-1 w-4 h-4" />}
          {Math.abs(change)}%
        </span>
        <span className="text-neutral-500 text-sm ml-2">{changeText}</span>
      </div>
    </div>
  );
}
