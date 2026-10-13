import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  Clock,
  Hourglass,
  MonitorSmartphone,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Empty, ErrorState, Loading, PageHeader } from '@/components/States';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatDateTime, formatDay, formatDuration, weekdayShort } from '@/lib/format';
import { CATEGORY_LABELS } from '@/lib/labels';
import type { Dashboard } from '@/lib/types';

export function DashboardPage() {
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Dashboard>('/dashboard'),
    refetchInterval: 60_000,
  });

  if (query.isPending) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data;
  const hasWeekData = data.week.some((d) => d.activeSec + d.idleSec > 0);
  const maxApp = Math.max(1, ...data.topApplications.map((a) => a.activeSec));
  // Kichik qiymatlar grafikda yo'qolib qolmasligi uchun: kunlik jami 2 soatdan kam bo'lsa daqiqalarda ko'rsatiladi.
  const inMinutes = Math.max(...data.week.map((d) => d.activeSec + d.idleSec)) < 2 * 3600;
  const unit = inMinutes ? 'daq' : 'soat';
  const scale = (sec: number) =>
    inMinutes ? Math.round(sec / 60) : Math.round((sec / 3600) * 10) / 10;
  const chartData = data.week.map((d) => ({
    day: `${weekdayShort(d.date)} ${d.date.slice(8)}`,
    Faol: scale(d.activeSec),
    Nofaol: scale(d.idleSec),
  }));

  return (
    <>
      <PageHeader
        title="Bosh sahifa"
        description={`Bugun: ${formatDay(data.date)} · Yangilangan: ${formatDateTime(data.generatedAt)} · Vaqt zonasi: ${data.timezone}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Jami xodimlar"
          value={String(data.employees.total)}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Bugun faol bo‘lgan xodimlar"
          value={String(data.employees.activeToday)}
          hint="Bugun agentdan faol vaqt qayd etilganlar"
          icon={<Activity className="h-5 w-5" />}
        />
        <StatCard
          label="Bugungi faol vaqt"
          value={formatDuration(data.today.activeSec)}
          hint={`Nofaol: ${formatDuration(data.today.idleSec)}`}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          label="Agentlar"
          value={`${data.agents.online} onlayn`}
          hint={`${data.agents.offline} oflayn`}
          icon={<MonitorSmartphone className="h-5 w-5" />}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Topshiriqlar bajarilishi"
          value={
            data.tasks.completionPct === null ? 'Ma’lumot yo‘q' : `${data.tasks.completionPct}%`
          }
          hint={`${data.tasks.done} / ${data.tasks.total} ta tasdiqlanib yakunlangan`}
          icon={<ClipboardCheck className="h-5 w-5" />}
        />
        <StatCard
          label="Muddati o‘tgan topshiriqlar"
          value={String(data.tasks.overdue)}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          label="Tekshiruvni kutayotgan"
          value={String(data.tasks.inReview)}
          icon={<Hourglass className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="So‘nggi 7 kun"
            description={`Faol va nofaol vaqt, ${inMinutes ? 'daqiqalarda' : 'soatlarda'}`}
          />
          <CardBody>
            {hasWeekData ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#dfe6e4" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} width={40} />
                    <Tooltip formatter={(value) => `${String(value)} ${unit}`} />
                    <Legend />
                    <Bar
                      isAnimationActive={false}
                      dataKey="Faol"
                      stackId="a"
                      fill="#087268"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      isAnimationActive={false}
                      dataKey="Nofaol"
                      stackId="a"
                      fill="#c5d3d0"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty
                title="Bu davr uchun ma’lumot yo‘q"
                hint="Agentlar ma’lumot yuborgach, grafik shu yerda paydo bo‘ladi."
              />
            )}
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Bugun eng ko‘p ishlatilgan dasturlar"
            description="Faol vaqt bo‘yicha"
          />
          <CardBody>
            {data.topApplications.length === 0 ? (
              <Empty title="Bugun hali ma’lumot kelmagan" />
            ) : (
              <ul className="space-y-3">
                {data.topApplications.map((app) => (
                  <li key={app.displayName}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{app.displayName}</span>
                      <span className="shrink-0 text-muted">{formatDuration(app.activeSec)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-surface">
                      <div
                        className="h-1.5 rounded-full bg-primary"
                        style={{ width: `${(app.activeSec / maxApp) * 100}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {CATEGORY_LABELS[app.category] ?? app.category}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <p className="mt-6 text-xs text-muted">
        Faol vaqt — dastur oldingi planda bo‘lib, klaviatura yoki sichqoncha ishlatilgan vaqt. U ish
        sifati yoki natijasini bildirmaydi. Raqamlar faqat sizga ko‘rish ruxsat etilgan xodimlar
        bo‘yicha hisoblangan.
      </p>
    </>
  );
}
