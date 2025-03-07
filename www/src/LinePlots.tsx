import ReactJsonView from '@microlink/react-json-view'
import { Arr } from "@rdub/base/arr"
import { Headings } from "@rdub/base/heading"
import { round } from "@rdub/base/math"
import { useDb } from "@rdub/duckdb-wasm/duckdb"
import { useQuery } from "@tanstack/react-query"
import { Int32 } from 'apache-arrow'
import { Annotations } from "plotly.js"
import * as Plotly from "plotly.js"
import Plot0, { PlotParams } from 'react-plotly.js'

export type Row = {
  month: Int32
  avg_weekday: Int32
  avg_weekend: Int32
}
export type Pcts = { week: number, wknd: number }

const height = 450
const DefaultHeight = height
export const gridcolor = "#ddd"
export const hovertemplate = "%{y:,.0f}"
export const hovertemplatePct = "%{y:.1%}"
const margin = {
  l: 40, r: 0,
  t: 0, b: 40,
}
const config: Partial<Plotly.Config> = {
  autosizable: true,
  responsive: true,
  displayModeBar: false,
}

export const url = 'https://hudcostreets.s3.amazonaws.com/path/all.pqt'
// const [ collapseLevel, setCollapseLevel] = useLocalStorageState<number | null>(CollapseLevelKey, { defaultValue: 2 })

export function ann({ x, ax, ...a }: Partial<Omit<Annotations, 'x' | 'ax'> & { x: number | Date, ax: number | Date }>): Partial<Annotations> {
  if (x instanceof Date) x = x.getTime()
  if (ax instanceof Date) ax = ax.getTime()
  return {
    axref: "x",
    arrowcolor: "#2a3f5f",
    arrowhead: 0,
    arrowwidth: 1,
    ...a,
    x, ax,
  }
}

export const { H2 } = Headings({ className: "heading" })

export function Loading({ height = DefaultHeight }: { height?: number }) {
  return <div className={"loading"} style={{ height }}>Loading...</div>
}

export function Plot(
  { id, title, ...props }: {
    id: string
    title: string
  } & ({
    data: Plotly.Data[]
    layout: Partial<Plotly.Layout>
  } | {})
) {
  const h2 = <H2 id={id}>{title}</H2>
  if (!('data' in props)) {
    return <>
      {h2}
      <Loading/>
    </>
  }
  let { data, layout: { xaxis = {}, yaxis = {}, ...layout } } = props
  xaxis = { gridcolor, ...xaxis }
  yaxis = { gridcolor, fixedrange: true, ...yaxis }
  return <>
    {h2}
    <Plot0
      className={'plot'}
      data={data}
      layout={{
        height,
        margin,
        hovermode: "x",
        xaxis, yaxis,
        ...layout,
      }}
      config={config}
    />
  </>
}

export default function LinePlots() {
  // const url = "/all.pqt"
  const dbConn = useDb()
  // const db = useMemo(() => new Db(), [])
  const { data: table, isError, error } = useQuery({
    queryKey: [ 'lines', url, dbConn === null ],
    refetchOnWindowFocus: false,
    refetchInterval: false,
    queryFn: async () => {
      if (!dbConn) return null
      const { conn } = dbConn
      console.log("running query:", conn)
      const query = `
          SELECT
              month,
              cast(sum("avg weekday") as int32) as avg_weekday,
              cast(sum("avg weekend") as int32) as avg_weekend
          FROM parquet_scan('${url}')
          group by month
          order by month
      `
      const table = await conn.query<Row>(query)
      const offset = new Date().getTimezoneOffset() * 60000
      const month: Date[] = Arr(table.getChild("month")!.toArray()).map(m => new Date(m + offset))
      // console.log("result:", table, table.getChild("month"))
      // console.log("months:", month)//month?.map(m => new Date(m)))
      const avg_weekday = Arr(table.getChild("avg_weekday")!.toArray())
      const avg_weekend = Arr(table.getChild("avg_weekend")!.toArray())
      conn.close()
      const idxs2019: number[] = (
        month
          .map((m, idx) => [ m, idx ] as [ Date, number ])
          .filter(([m]) => m.getFullYear() === 2019)
          .map(([, idx]) => idx)
      )
      const pcts2019: Pcts[] = month.map((m, idx) => {
        const mo = m.getMonth()
        const week = avg_weekday[idx] / avg_weekday[idxs2019[mo]]
        const wknd = avg_weekend[idx] / avg_weekend[idxs2019[mo]]
        return { week, wknd }
      })
      return { month, avg_weekday, avg_weekend, pcts2019, idxs2019 }
    }
  })
  let dailyPlot: Pick<PlotParams, 'data' | 'layout'> | {} = {}
  let vs2019Plot: Pick<PlotParams, 'data' | 'layout'> | {} = {}
  if (table) {
    const { month, avg_weekday, avg_weekend, pcts2019, idxs2019 } = table
    const idx2020 = idxs2019[11] + 1
    const monthsFrom2020 = month.slice(idx2020)
    const pcts2019From2020 = pcts2019.slice(idx2020)
    const lastPcts = pcts2019From2020[pcts2019From2020.length - 1]
    const n = month.length
    let lastMoStr = month[n - 1].toLocaleDateString('en-US', {
      month: 'short',
      year: '2-digit'
    })
    lastMoStr = `${lastMoStr.substring(0, lastMoStr.length - 2)}'${lastMoStr.substring(lastMoStr.length - 2)}`
    dailyPlot = {
      data: [
        {
          name: "Avg Weekday",
          x: month, y: avg_weekday,
          marker: { color: 'red' },
          hovertemplate,
        },
        {
          name: "Avg Weekend",
          x: month, y: avg_weekend,
          marker: { color: 'blue' },
          hovertemplate,
        },
      ],
      layout: {
        xaxis: { dtick: "M12", },
        legend: {
          yanchor:   "top", y: 0.99,
          xanchor: "right", x: 0.99,
        },
        annotations: [
          ann({
            ax: month[n - 10],
            text: `${lastMoStr}: ${avg_weekday[n - 1].toLocaleString()}`,
            x: month[n - 1],
            y: avg_weekday[n - 1],
          }),
          ann({
            ax: month[n - 10],
            text: `${lastMoStr}: ${avg_weekend[n - 1].toLocaleString()}`,
            x: month[n - 1],
            y: avg_weekend[n - 1],
          }),
        ]
      }
    }
    vs2019Plot = {
      data: [
        {
          name: "Avg Weekday (% of 2019)",
          x: monthsFrom2020, y: pcts2019From2020.map(p => p.week),
          marker: { color: 'red' },
          hovertemplate: hovertemplatePct,
        },
        {
          name: "Avg Weekend (% of 2019)",
          x: monthsFrom2020, y: pcts2019From2020.map(p => p.wknd),
          marker: { color: 'blue' },
          hovertemplate: hovertemplatePct,
        },
      ],
      layout: {
        xaxis: {
          dtick: "M3",
          tickformat: "%b '%y",
          tickangle: 45,
        },
        yaxis: {
          dtick: 0.1,
          tickformat: ',.0%',
        },
        legend: {
          yanchor: "bottom", y: 0.03,
          xanchor:  "right", x: 0.99,
        },
        annotations: [
          ann({
            ax: month[n - 3],
            text: `${lastMoStr}: ${round(lastPcts.week * 1000) / 10}%`,
            x: month[n - 1],
            y: lastPcts.week,
          }),
          ann({
            ax: month[n - 3],
            text: `${lastMoStr}: ${round(lastPcts.wknd * 1000) / 10}%`,
            x: month[n - 1],
            y: lastPcts.wknd,
          }),
        ]
      }
    }
  }
  // console.log("data:", data)
  return (
    <div className={"plot-container"}>
      {isError ? <div className={"error"}>Error: {error?.toString()}</div> : null}
      <Plot
        id={"rides"}
        title={"Avg PATH rides per day"}
        {...dailyPlot}
      />
      <Plot
        id={"vs-2019"}
        title={"Avg PATH rides per day (vs. 2019)"}
        {...vs2019Plot}
      />
      <p>Weekend ridership has surpassed pre-COVID levels, though service remains degraded.</p>
      <hr/>
      <div>
        {
          table ?
            <details>
              <summary>Plot data</summary>
              <ReactJsonView
                src={table}
                // collapsed={collapseLevel ?? false}
                displayDataTypes={false}
                displayArrayKey={true}
                name={false}
                displayObjectSize
                enableClipboard
                quotesOnKeys={false}
              />
            </details>
            : null
        }
      </div>
    </div>
  )
}
