import { describe, expect, it } from 'vitest';
import { analyticsWindow, csvCell, dailyBuckets } from '../routes/analytics';
describe('strict dated analytics',()=>{
 const now=Date.parse('2026-10-09T23:59:59Z');
 it('defaults to UTC days including today and exclusively ends tomorrow',()=>{expect(analyticsWindow(new URL('https://v/api'),now)).toEqual({start:Date.parse('2026-09-10'),end:Date.parse('2026-10-10'),periodDays:30});});
 it('rejects missing, impossible, future, reversed and over90-day dates',()=>{for(const q of ['start=2026-10-01','start=2026-02-30&end=2026-03-01','start=2026-10-09&end=2026-10-11','start=2026-10-09&end=2026-10-09','start=2026-07-01&end=2026-10-10'])expect(analyticsWindow(new URL('https://v/api?'+q),now)).toBeNull();});
 it('accepts exactly90days and rejects duplicate dates',()=>{expect(analyticsWindow(new URL('https://v/?start=2026-07-12&end=2026-10-10'),now)?.periodDays).toBe(90);expect(analyticsWindow(new URL('https://v/?start=2026-10-01&start=2026-10-02&end=2026-10-10'),now)).toBeNull();});
 it('includes zeros and exact wei for settled timestamps; failures use creation time',()=>{const w=analyticsWindow(new URL('https://v/?start=2026-10-07&end=2026-10-10'),now)!; const data=dailyBuckets([{outcome:'settled',settled_at:Date.parse('2026-10-08'),amount_wei:'9007199254740993000'},{outcome:'refunded',created_at:Date.parse('2026-10-09')}] as any,w);expect(data.map(v=>v.date)).toEqual(['2026-10-07','2026-10-08','2026-10-09']); expect(data[0].settledQueries).toBe(0);expect(data[1].recordedRevenueWei).toBe('9007199254740993000');expect(data[2].refundedQueries).toBe(1);});
 it('escapes quotes and protects whitespace-prefix formulas',()=>{expect(csvCell('Guide,"hi"')).toBe('"Guide,""hi"""');for(const value of ['=SUM(A1)',' +2','\t@cmd','-1'])expect(csvCell(value)).toBe('"\''+value+'"');expect(csvCell('9007199254740993000')).toBe('"9007199254740993000"');});
});
