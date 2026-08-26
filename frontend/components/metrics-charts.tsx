"use client";

type Point = {
  timestamp: string;
  requests: number;
  successful: number;
  failed: number;
  average_latency_ms: number;
};

export default function MetricsCharts({ data }: { data: Point[] }) {
  if (!data.length) return <div className="chart-empty">No metrics available yet.</div>;
  const maxRequests = Math.max(1, ...data.map((point) => point.requests));
  const maxLatency = Math.max(1, ...data.map((point) => point.average_latency_ms));
  const totalRequests = data.reduce((sum, point) => sum + point.requests, 0);
  const averageLatency = Math.round(data.reduce((sum, point) => sum + point.average_latency_ms, 0) / data.length);

  return <div className="charts">
    <div className="chart-card">
      <div className="chart-title"><div><strong>Request Volume</strong><span>Last 24 hours</span></div><strong>{totalRequests} requests</strong></div>
      <div className="bar-chart" aria-label="Request volume by hour">
        {data.map((point) => <div className="bar-column" key={point.timestamp} title={`${new Date(point.timestamp).toLocaleString()}: ${point.requests} requests`}>
          <div className="bar-stack" style={{ height: `${Math.max(2, (point.requests / maxRequests) * 100)}%` }}>
            <div className="bar-success" style={{ height: `${point.requests ? (point.successful / point.requests) * 100 : 0}%` }} />
            <div className="bar-failed" style={{ height: `${point.requests ? (point.failed / point.requests) * 100 : 0}%` }} />
          </div>
        </div>)}
      </div>
      <div className="chart-axis"><span>{new Date(data[0].timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><span>Now</span></div>
    </div>

    <div className="chart-card">
      <div className="chart-title"><div><strong>Average Latency</strong><span>Hourly average</span></div><strong>{averageLatency} ms</strong></div>
      <div className="latency-chart" aria-label="Average latency by hour">
        <svg viewBox="0 0 720 180" preserveAspectRatio="none" role="img">
          <polyline fill="none" stroke="currentColor" strokeWidth="3" points={data.map((point, index) => `${(index / Math.max(1, data.length - 1)) * 720},${170 - (point.average_latency_ms / maxLatency) * 145}`).join(" ")} />
        </svg>
      </div>
      <div className="chart-axis"><span>{new Date(data[0].timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><span>Now</span></div>
    </div>
  </div>;
}
