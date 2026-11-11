// 小样用的数据快照，由 data/events.json 原样复制（2026-11-11）。正式版运行时读取 data/events.json。
window.EVENTS_DATA = {
 "generated_at": "2026-11-11T18:44:41+00:00",
 "disclaimer": "仅整理公开披露信息，不构成投资建议，不预测涨跌。",
 "events": [
  {
   "id": "600187-2025A-forecast",
   "code": "600187",
   "name": "*ST国中",
   "type": "业绩预告",
   "period": "2025 年年度",
   "title": "2025 年年度业绩预告及两次更正",
   "merge_reason": "同一公司、同一报告期（2025-01-01 至 2025-12-31）的业绩预告；后两份公告在正文中点名引用前一份的公告编号（临 2026-003、临 2026-014）。",
   "occurred": {
    "start": "2025-01-01",
    "end": "2025-12-31",
    "note": "说法所指的报告期"
   },
   "evidence": [
    {
     "id": "e1",
     "ann": "1224956497",
     "doc_no": "临 2026-003",
     "kind": "事实",
     "relation": {
      "type": "首次披露"
     },
     "title": "2025年年度业绩预亏公告",
     "url": "http://static.cninfo.com.cn/finalpage/2026-01-30/1224956497.PDF",
     "source": "巨潮资讯网",
     "source_tier": "A",
     "tier_note": "交易所指定披露平台上的公司公告",
     "times": {
      "occurred": {
       "start": "2025-01-01",
       "end": "2025-12-31",
       "note": "说法所指的报告期"
      },
      "disclosed": "2026-01-30",
      "signed": "2026-01-30",
      "fetched": "2026-11-11T18:35:40+00:00",
      "updated": null
     }
    },
    {
     "id": "e2",
     "ann": "1225121518",
     "doc_no": "临 2026-014",
     "kind": "事实",
     "relation": {
      "type": "更正",
      "target": "e1"
     },
     "reason": "子公司荣县水务增补确认的污水处理费 2,207 万元询证函未回函，无法确认收入。",
     "reason_quote": "询证函未得到回函，因此无法确认这部分污水处理费所形成的收入",
     "title": "2025年年度业绩预告更正公告",
     "url": "http://static.cninfo.com.cn/finalpage/2026-04-18/1225121518.PDF",
     "source": "巨潮资讯网",
     "source_tier": "A",
     "tier_note": "交易所指定披露平台上的公司公告",
     "times": {
      "occurred": {
       "start": "2025-01-01",
       "end": "2025-12-31",
       "note": "说法所指的报告期"
      },
      "disclosed": "2026-04-18",
      "signed": null,
      "fetched": "2026-11-11T18:35:40+00:00",
      "updated": null
     }
    },
    {
     "id": "e3",
     "ann": "1225230061",
     "doc_no": "临 2026-015",
     "kind": "事实",
     "relation": {
      "type": "更正",
      "target": "e2"
     },
     "reason": "对诸暨文盛汇（间接持有北京汇源 20.89%）的长期投资，2025 年度不再确认投资收益，并计提资产减值损失。",
     "reason_quote": "现2025年度不再确认投资收益，同时计提资产减值损失",
     "title": "2025年年度业绩预告再次更正公告",
     "url": "http://static.cninfo.com.cn/finalpage/2026-04-29/1225230061.PDF",
     "source": "巨潮资讯网",
     "source_tier": "A",
     "tier_note": "交易所指定披露平台上的公司公告",
     "times": {
      "occurred": {
       "start": "2025-01-01",
       "end": "2025-12-31",
       "note": "说法所指的报告期"
      },
      "disclosed": "2026-04-29",
      "signed": null,
      "fetched": "2026-11-11T18:35:40+00:00",
      "updated": null
     }
    }
   ],
   "claims": [
    {
     "key": "归母净利润",
     "versions": [
      {
       "v": 1,
       "evidence_id": "e1",
       "low": -13000,
       "high": -10400,
       "unit": "万元",
       "quote": "归属于母公司所有者的净利润-13,000万元到-10,400万元",
       "valid_from": "2026-01-30",
       "valid_to": "2026-04-18",
       "status": "superseded",
       "superseded_by": "e2"
      },
      {
       "v": 2,
       "evidence_id": "e2",
       "low": -15500,
       "high": -13000,
       "unit": "万元",
       "quote": "归属于母公司所有者的净利润-15,500万元到-13,000万元",
       "valid_from": "2026-04-18",
       "valid_to": "2026-04-29",
       "status": "superseded",
       "superseded_by": "e3"
      },
      {
       "v": 3,
       "evidence_id": "e3",
       "low": -21491,
       "high": -21491,
       "unit": "万元",
       "quote": "归属于母公司所有者的净利润-21,491万元",
       "valid_from": "2026-04-29",
       "valid_to": null,
       "status": "active",
       "superseded_by": null
      }
     ]
    },
    {
     "key": "扣非净利润",
     "versions": [
      {
       "v": 1,
       "evidence_id": "e1",
       "low": 900,
       "high": 1080,
       "unit": "万元",
       "quote": "扣除非经常性损益后的净利润为900万元到1,080万元",
       "valid_from": "2026-01-30",
       "valid_to": "2026-04-18",
       "status": "superseded",
       "superseded_by": "e2"
      },
      {
       "v": 2,
       "evidence_id": "e2",
       "low": -3600,
       "high": -2900,
       "unit": "万元",
       "quote": "扣除非经常性损益后的净利润为-3,600万元到-2,900万元",
       "valid_from": "2026-04-18",
       "valid_to": "2026-04-29",
       "status": "superseded",
       "superseded_by": "e3"
      },
      {
       "v": 3,
       "evidence_id": "e3",
       "low": -5976,
       "high": -5976,
       "unit": "万元",
       "quote": "扣除非经常性损益后的净利润为-5,976万元",
       "valid_from": "2026-04-29",
       "valid_to": null,
       "status": "active",
       "superseded_by": null
      }
     ]
    },
    {
     "key": "利润总额",
     "versions": [
      {
       "v": 1,
       "evidence_id": "e1",
       "low": -11000,
       "high": -8800,
       "unit": "万元",
       "quote": "利润总额-11,000万元到-8,800万元",
       "valid_from": "2026-01-30",
       "valid_to": "2026-04-18",
       "status": "superseded",
       "superseded_by": "e2"
      },
      {
       "v": 2,
       "evidence_id": "e2",
       "low": -13900,
       "high": -11200,
       "unit": "万元",
       "quote": "利润总额-13,900万元到-11,200万元",
       "valid_from": "2026-04-18",
       "valid_to": "2026-04-29",
       "status": "superseded",
       "superseded_by": "e3"
      },
      {
       "v": 3,
       "evidence_id": "e3",
       "low": -19651,
       "high": -19651,
       "unit": "万元",
       "quote": "利润总额-19,651万元",
       "valid_from": "2026-04-29",
       "valid_to": null,
       "status": "active",
       "superseded_by": null
      }
     ]
    },
    {
     "key": "营业收入",
     "versions": [
      {
       "v": 1,
       "evidence_id": "e1",
       "low": 21000,
       "high": 25200,
       "unit": "万元",
       "quote": "营业收入21,000万元到25,200万元",
       "valid_from": "2026-01-30",
       "valid_to": "2026-04-18",
       "status": "superseded",
       "superseded_by": "e2"
      },
      {
       "v": 2,
       "evidence_id": "e2",
       "low": 20000,
       "high": 24000,
       "unit": "万元",
       "quote": "营业收入20,000万元到24,000万元",
       "valid_from": "2026-04-18",
       "valid_to": "2026-04-29",
       "status": "superseded",
       "superseded_by": "e3"
      },
      {
       "v": 3,
       "evidence_id": "e3",
       "low": 22282,
       "high": 22282,
       "unit": "万元",
       "quote": "营业收入22,282万元",
       "valid_from": "2026-04-29",
       "valid_to": null,
       "status": "active",
       "superseded_by": null
      }
     ]
    }
   ],
   "conflicts": [
    {
     "id": "c1",
     "kind": "日期不一致",
     "evidence_ids": [
      "e2",
      "e1"
     ],
     "text": "更正公告称前次预告披露于 2025 年 1 月 30 日；前次公告落款和巨潮披露日均为 2026 年 1 月 30 日。",
     "resolution": "以交易所披露日为准（2026-01-30），更正公告中的年份判断为笔误。这是推断，不是公司确认的事实。",
     "quotes": [
      {
       "evidence_id": "e2",
       "quote": "公司于2025年1月30日在上海证券交易所网站披露了《2025年年度业绩预亏公告》"
      },
      {
       "evidence_id": "e1",
       "quote": "2026年1月30日"
      }
     ]
    }
   ],
   "pending": [
    "2025 年年度报告实际数与 5-06 年报更正公告尚未并入本事件",
    "扶摇行情未接入，暂无法显示各次更正前后的股价与成交量"
   ],
   "status": "已更正",
   "status_since": "2026-04-29",
   "notifications": [
    {
     "at": "2026-01-30",
     "type": "首次披露",
     "evidence_id": "e1",
     "text": "临 2026-003 首次披露"
    },
    {
     "at": "2026-04-18",
     "type": "更正",
     "evidence_id": "e2",
     "text": "临 2026-014 更正了 临 2026-003"
    },
    {
     "at": "2026-04-29",
     "type": "更正",
     "evidence_id": "e3",
     "text": "临 2026-015 更正了 临 2026-014"
    }
   ]
  }
 ]
};
