// src/app/dev/stuff-lab-preview/mock.ts
//
// INVENTED data for the dev-only preview of the x9Stuff Lab (/dev/stuff-lab-preview). Not real pitchers, not real numbers. Never imported by the real page.
// Generated from mockups/front-office-pitch-grades.html's data; shaped like the lab's own types so the preview renders the real component.

import type { PitcherGrade, StuffBoard, StuffDetail } from '@/lib/stuff-lab/data'

export const MOCK_BOARD: StuffBoard = {
  season: 2026, version: 'MOCK', updated: null, full: true,
  pitchers: [
 {
  "id": 900001,
  "name": "Pitcher A",
  "hand": "R",
  "pitches": 1838,
  "velo": 90.0,
  "ivb": 7.0,
  "hb": 3.9,
  "spin": 2212,
  "actual": 0.61,
  "expected": 0.67,
  "era": null,
  "xera": null,
  "kbb": null,
  "note": null,
  "stuff": 111,
  "command": 111,
  "overall": 111,
  "miss": 113,
  "chase": 108,
  "steal": 108,
  "gb": 102,
  "pop": 106,
  "weak": 108
 },
 {
  "id": 900002,
  "name": "Pitcher B",
  "hand": "L",
  "pitches": 1319,
  "velo": 89.0,
  "ivb": 9.6,
  "hb": 2.9,
  "spin": 2252,
  "actual": 0.38,
  "expected": 0.33,
  "era": null,
  "xera": null,
  "kbb": null,
  "note": null,
  "stuff": 110,
  "command": 103,
  "overall": 106,
  "miss": 108,
  "chase": 109,
  "steal": 103,
  "gb": 105,
  "pop": 109,
  "weak": 111
 },
 {
  "id": 900003,
  "name": "Pitcher C",
  "hand": "R",
  "pitches": 909,
  "velo": 89.7,
  "ivb": 6.2,
  "hb": 8.4,
  "spin": 2220,
  "actual": 0.55,
  "expected": 0.27,
  "era": null,
  "xera": null,
  "kbb": null,
  "note": null,
  "stuff": 103,
  "command": 107,
  "overall": 104,
  "miss": 101,
  "chase": 104,
  "steal": 103,
  "gb": 110,
  "pop": 94,
  "weak": 108
 },
 {
  "id": 900004,
  "name": "Pitcher D",
  "hand": "R",
  "pitches": 619,
  "velo": 91.1,
  "ivb": 11.5,
  "hb": 5.7,
  "spin": 2156,
  "actual": -0.07,
  "expected": 0.2,
  "era": null,
  "xera": null,
  "kbb": null,
  "note": null,
  "stuff": 115,
  "command": 95,
  "overall": 105,
  "miss": 113,
  "chase": 113,
  "steal": 109,
  "gb": 106,
  "pop": 112,
  "weak": 107
 },
 {
  "id": 900005,
  "name": "Pitcher E",
  "hand": "L",
  "pitches": 479,
  "velo": 88.0,
  "ivb": 3.4,
  "hb": 9.4,
  "spin": 2184,
  "actual": -0.06,
  "expected": -0.09,
  "era": null,
  "xera": null,
  "kbb": null,
  "note": null,
  "stuff": 93,
  "command": 105,
  "overall": 97,
  "miss": 91,
  "chase": 99,
  "steal": 100,
  "gb": 108,
  "pop": 91,
  "weak": 101
 },
 {
  "id": 900006,
  "name": "Pitcher F",
  "hand": "R",
  "pitches": 308,
  "velo": 91.5,
  "ivb": 11.0,
  "hb": 2.9,
  "spin": 2330,
  "actual": 0.36,
  "expected": 0.38,
  "era": null,
  "xera": null,
  "kbb": null,
  "note": "command still settling",
  "stuff": 110,
  "command": 100,
  "overall": 107,
  "miss": 114,
  "chase": 105,
  "steal": 110,
  "gb": 99,
  "pop": 111,
  "weak": 101
 },
 {
  "id": 900007,
  "name": "Pitcher G",
  "hand": "R",
  "pitches": 1650,
  "velo": 89.8,
  "ivb": 8.4,
  "hb": 4.9,
  "spin": 2205,
  "actual": -0.82,
  "expected": 0.42,
  "era": null,
  "xera": null,
  "kbb": null,
  "note": null,
  "stuff": 119,
  "command": 96,
  "overall": 109,
  "miss": 117,
  "chase": 110,
  "steal": 110,
  "gb": 110,
  "pop": 110,
  "weak": 113
 },
 {
  "id": 900008,
  "name": "Pitcher H",
  "hand": "L",
  "pitches": 189,
  "velo": 90.0,
  "ivb": 5.1,
  "hb": 7.7,
  "spin": 2293,
  "actual": 0.34,
  "expected": 0.22,
  "era": null,
  "xera": null,
  "kbb": null,
  "note": "command still settling",
  "stuff": 107,
  "command": 104,
  "overall": 104,
  "miss": 104,
  "chase": 106,
  "steal": 103,
  "gb": 113,
  "pop": 99,
  "weak": 105
 }
] as PitcherGrade[],
}

export const MOCK_DETAILS: Record<string, StuffDetail> = {
 "900001": {
  "id": 900001,
  "hand": "R",
  "pitchGrades": [
   {
    "type": "FF",
    "pitches": 809,
    "usage": 44,
    "velo": 95.0,
    "ivb": 15.0,
    "hb": 7.0,
    "spin": 2306,
    "actual": 0.17,
    "expected": 0.54,
    "note": null,
    "stuff": 110,
    "command": 112,
    "overall": 108,
    "miss": 104,
    "chase": 103,
    "steal": 109,
    "gb": 91,
    "pop": 116,
    "weak": 104
   },
   {
    "type": "SL",
    "pitches": 570,
    "usage": 31,
    "velo": 87.6,
    "ivb": 1.2,
    "hb": -3.0,
    "spin": 2187,
    "actual": 1.36,
    "expected": 1.14,
    "note": null,
    "stuff": 118,
    "command": 115,
    "overall": 119,
    "miss": 125,
    "chase": 114,
    "steal": 109,
    "gb": 111,
    "pop": 98,
    "weak": 112
   },
   {
    "type": "CH",
    "pitches": 312,
    "usage": 17,
    "velo": 85.8,
    "ivb": 4.9,
    "hb": 13.7,
    "spin": 1833,
    "actual": 0.26,
    "expected": 0.29,
    "note": "command still settling",
    "stuff": 103,
    "command": 108,
    "overall": 104,
    "miss": 114,
    "chase": 108,
    "steal": 104,
    "gb": 112,
    "pop": 97,
    "weak": 107
   },
   {
    "type": "CU",
    "pitches": 147,
    "usage": 8,
    "velo": 80.4,
    "ivb": -10.1,
    "hb": -7.3,
    "spin": 2598,
    "actual": 0.9,
    "expected": 0.38,
    "note": "command still settling",
    "stuff": 108,
    "command": 102,
    "overall": 107,
    "miss": 111,
    "chase": 110,
    "steal": 111,
    "gb": 101,
    "pop": 102,
    "weak": 112
   }
  ],
  "pressure": [
   {
    "pressure": "high",
    "pitches": 312,
    "overall": 109,
    "command": 110,
    "fastballPct": 49,
    "actual": 0.68
   },
   {
    "pressure": "normal",
    "pitches": 1526,
    "overall": 112,
    "command": 112,
    "fastballPct": 45,
    "actual": 0.53
   }
  ],
  "shape": {
   "FF": {
    "n": 809,
    "velo": 95.0,
    "ivb": 15.0,
    "hb": 7.0,
    "rpm": 2306,
    "points": [
     {
      "hb": 6.6,
      "ivb": 15.8
     },
     {
      "hb": 6.6,
      "ivb": 14.5
     },
     {
      "hb": 5.5,
      "ivb": 14.7
     },
     {
      "hb": 8.8,
      "ivb": 15.7
     },
     {
      "hb": 8.7,
      "ivb": 15.4
     },
     {
      "hb": 7.6,
      "ivb": 15.3
     },
     {
      "hb": 4.3,
      "ivb": 16.4
     },
     {
      "hb": 7.8,
      "ivb": 15.8
     },
     {
      "hb": 4.3,
      "ivb": 12.2
     },
     {
      "hb": 5.6,
      "ivb": 14.3
     },
     {
      "hb": 7.5,
      "ivb": 14.9
     },
     {
      "hb": 7.8,
      "ivb": 14.0
     },
     {
      "hb": 7.5,
      "ivb": 15.6
     },
     {
      "hb": 5.9,
      "ivb": 17.7
     },
     {
      "hb": 7.9,
      "ivb": 16.9
     },
     {
      "hb": 6.0,
      "ivb": 13.8
     },
     {
      "hb": 6.4,
      "ivb": 14.8
     },
     {
      "hb": 8.0,
      "ivb": 15.4
     },
     {
      "hb": 6.3,
      "ivb": 13.5
     },
     {
      "hb": 6.2,
      "ivb": 17.0
     },
     {
      "hb": 5.7,
      "ivb": 15.4
     },
     {
      "hb": 7.7,
      "ivb": 12.6
     },
     {
      "hb": 7.1,
      "ivb": 17.1
     },
     {
      "hb": 3.8,
      "ivb": 14.5
     },
     {
      "hb": 6.8,
      "ivb": 13.7
     },
     {
      "hb": 7.8,
      "ivb": 14.9
     },
     {
      "hb": 4.7,
      "ivb": 16.3
     },
     {
      "hb": 8.1,
      "ivb": 16.5
     },
     {
      "hb": 9.3,
      "ivb": 15.6
     },
     {
      "hb": 7.2,
      "ivb": 12.9
     },
     {
      "hb": 8.0,
      "ivb": 14.0
     },
     {
      "hb": 6.3,
      "ivb": 13.0
     },
     {
      "hb": 5.5,
      "ivb": 14.2
     },
     {
      "hb": 9.1,
      "ivb": 11.7
     },
     {
      "hb": 4.7,
      "ivb": 15.4
     },
     {
      "hb": 9.3,
      "ivb": 15.9
     },
     {
      "hb": 4.0,
      "ivb": 11.0
     },
     {
      "hb": 7.6,
      "ivb": 13.8
     },
     {
      "hb": 5.2,
      "ivb": 16.6
     },
     {
      "hb": 8.8,
      "ivb": 15.3
     }
    ]
   },
   "SL": {
    "n": 570,
    "velo": 87.6,
    "ivb": 1.2,
    "hb": -3.0,
    "rpm": 2187,
    "points": [
     {
      "hb": -2.6,
      "ivb": 1.9
     },
     {
      "hb": -0.4,
      "ivb": 2.2
     },
     {
      "hb": -2.2,
      "ivb": 2.1
     },
     {
      "hb": -5.5,
      "ivb": 3.3
     },
     {
      "hb": -1.5,
      "ivb": 2.0
     },
     {
      "hb": -6.2,
      "ivb": 0.2
     },
     {
      "hb": -1.7,
      "ivb": -1.7
     },
     {
      "hb": -3.3,
      "ivb": 2.8
     },
     {
      "hb": -5.1,
      "ivb": 3.8
     },
     {
      "hb": -2.1,
      "ivb": 1.0
     },
     {
      "hb": -2.5,
      "ivb": 2.2
     },
     {
      "hb": -2.8,
      "ivb": 3.0
     },
     {
      "hb": -4.1,
      "ivb": 0.5
     },
     {
      "hb": -1.3,
      "ivb": 1.2
     },
     {
      "hb": -4.4,
      "ivb": 2.7
     },
     {
      "hb": -0.7,
      "ivb": 0.5
     },
     {
      "hb": -5.2,
      "ivb": 1.0
     },
     {
      "hb": -3.2,
      "ivb": 0.7
     },
     {
      "hb": -0.8,
      "ivb": -0.4
     },
     {
      "hb": -1.0,
      "ivb": -0.8
     },
     {
      "hb": -4.3,
      "ivb": 2.2
     },
     {
      "hb": -1.2,
      "ivb": 2.6
     },
     {
      "hb": -2.4,
      "ivb": 1.4
     },
     {
      "hb": -2.8,
      "ivb": 2.1
     },
     {
      "hb": -3.3,
      "ivb": 1.6
     },
     {
      "hb": -2.1,
      "ivb": 1.2
     },
     {
      "hb": -1.8,
      "ivb": 2.1
     },
     {
      "hb": 0.2,
      "ivb": 1.7
     },
     {
      "hb": -3.7,
      "ivb": 0.6
     },
     {
      "hb": -3.0,
      "ivb": 2.7
     },
     {
      "hb": -3.5,
      "ivb": 1.8
     },
     {
      "hb": -0.1,
      "ivb": -2.9
     },
     {
      "hb": -4.8,
      "ivb": 1.6
     },
     {
      "hb": -2.4,
      "ivb": 1.6
     },
     {
      "hb": -3.7,
      "ivb": 2.2
     },
     {
      "hb": -2.5,
      "ivb": 0.4
     },
     {
      "hb": 0.9,
      "ivb": 1.8
     },
     {
      "hb": -3.9,
      "ivb": 1.0
     },
     {
      "hb": -3.4,
      "ivb": 1.1
     },
     {
      "hb": -7.4,
      "ivb": 0.4
     }
    ]
   },
   "CH": {
    "n": 312,
    "velo": 85.8,
    "ivb": 4.9,
    "hb": 13.7,
    "rpm": 1833,
    "points": [
     {
      "hb": 15.3,
      "ivb": 3.0
     },
     {
      "hb": 13.6,
      "ivb": 6.4
     },
     {
      "hb": 15.1,
      "ivb": 7.3
     },
     {
      "hb": 11.0,
      "ivb": 4.3
     },
     {
      "hb": 13.2,
      "ivb": 5.9
     },
     {
      "hb": 15.4,
      "ivb": 0.6
     },
     {
      "hb": 15.4,
      "ivb": 2.6
     },
     {
      "hb": 14.8,
      "ivb": 2.5
     },
     {
      "hb": 14.0,
      "ivb": 6.8
     },
     {
      "hb": 13.5,
      "ivb": 5.2
     },
     {
      "hb": 15.0,
      "ivb": 5.1
     },
     {
      "hb": 13.6,
      "ivb": 7.4
     },
     {
      "hb": 15.4,
      "ivb": 4.4
     },
     {
      "hb": 18.1,
      "ivb": 3.1
     },
     {
      "hb": 15.2,
      "ivb": 4.5
     },
     {
      "hb": 13.9,
      "ivb": 6.0
     },
     {
      "hb": 14.1,
      "ivb": 5.9
     },
     {
      "hb": 11.3,
      "ivb": 2.5
     },
     {
      "hb": 14.7,
      "ivb": 3.4
     },
     {
      "hb": 12.1,
      "ivb": 2.5
     },
     {
      "hb": 15.7,
      "ivb": 6.1
     },
     {
      "hb": 16.1,
      "ivb": 3.4
     },
     {
      "hb": 13.7,
      "ivb": 3.1
     },
     {
      "hb": 14.9,
      "ivb": 7.4
     },
     {
      "hb": 12.3,
      "ivb": 7.4
     },
     {
      "hb": 15.3,
      "ivb": 4.6
     },
     {
      "hb": 10.5,
      "ivb": 7.2
     },
     {
      "hb": 13.5,
      "ivb": 3.9
     },
     {
      "hb": 14.3,
      "ivb": 5.6
     },
     {
      "hb": 16.1,
      "ivb": 3.3
     },
     {
      "hb": 15.5,
      "ivb": 7.3
     },
     {
      "hb": 16.0,
      "ivb": 4.6
     },
     {
      "hb": 12.5,
      "ivb": 6.5
     },
     {
      "hb": 13.9,
      "ivb": 5.1
     },
     {
      "hb": 16.0,
      "ivb": 4.5
     },
     {
      "hb": 10.0,
      "ivb": 4.3
     },
     {
      "hb": 10.7,
      "ivb": 6.2
     },
     {
      "hb": 14.2,
      "ivb": 3.9
     },
     {
      "hb": 13.7,
      "ivb": 6.2
     },
     {
      "hb": 13.8,
      "ivb": 7.0
     }
    ]
   },
   "CU": {
    "n": 147,
    "velo": 80.4,
    "ivb": -10.1,
    "hb": -7.3,
    "rpm": 2598,
    "points": [
     {
      "hb": -7.4,
      "ivb": -8.4
     },
     {
      "hb": -4.9,
      "ivb": -7.5
     },
     {
      "hb": -8.4,
      "ivb": -8.7
     },
     {
      "hb": -10.3,
      "ivb": -11.8
     },
     {
      "hb": -10.4,
      "ivb": -8.4
     },
     {
      "hb": -9.3,
      "ivb": -10.1
     },
     {
      "hb": -7.6,
      "ivb": -10.1
     },
     {
      "hb": -8.2,
      "ivb": -9.7
     },
     {
      "hb": -4.4,
      "ivb": -10.0
     },
     {
      "hb": -6.5,
      "ivb": -8.5
     },
     {
      "hb": -7.6,
      "ivb": -12.1
     },
     {
      "hb": -8.2,
      "ivb": -8.4
     },
     {
      "hb": -9.9,
      "ivb": -11.1
     },
     {
      "hb": -5.7,
      "ivb": -8.8
     },
     {
      "hb": -7.3,
      "ivb": -8.8
     },
     {
      "hb": -7.0,
      "ivb": -12.0
     },
     {
      "hb": -9.8,
      "ivb": -11.1
     },
     {
      "hb": -5.8,
      "ivb": -11.0
     },
     {
      "hb": -8.7,
      "ivb": -11.3
     },
     {
      "hb": -9.8,
      "ivb": -10.3
     },
     {
      "hb": -9.2,
      "ivb": -9.5
     },
     {
      "hb": -11.1,
      "ivb": -9.6
     },
     {
      "hb": -8.3,
      "ivb": -13.2
     },
     {
      "hb": -6.1,
      "ivb": -10.5
     },
     {
      "hb": -10.9,
      "ivb": -11.5
     },
     {
      "hb": -6.8,
      "ivb": -10.8
     },
     {
      "hb": -6.1,
      "ivb": -8.9
     },
     {
      "hb": -6.2,
      "ivb": -9.6
     },
     {
      "hb": -5.2,
      "ivb": -9.0
     },
     {
      "hb": -6.6,
      "ivb": -13.4
     },
     {
      "hb": -5.9,
      "ivb": -8.0
     },
     {
      "hb": -7.8,
      "ivb": -10.9
     },
     {
      "hb": -4.2,
      "ivb": -12.9
     },
     {
      "hb": -6.5,
      "ivb": -6.2
     },
     {
      "hb": -8.8,
      "ivb": -9.0
     },
     {
      "hb": -4.3,
      "ivb": -10.3
     },
     {
      "hb": -6.4,
      "ivb": -8.7
     },
     {
      "hb": -8.7,
      "ivb": -10.2
     },
     {
      "hb": -6.8,
      "ivb": -8.8
     },
     {
      "hb": -7.4,
      "ivb": -10.4
     }
    ]
   }
  },
  "outcomes": {
   "FF": {
    "n": 809,
    "take": 430,
    "swing": 379,
    "calledStrike": 131,
    "ball": 295,
    "hbp": 3,
    "whiff": 100,
    "foul": 134,
    "inPlay": 145,
    "pop": 10,
    "weakGb": 29,
    "hardGb": 26,
    "line": 32,
    "weakFb": 26,
    "hardFb": 23,
    "unclassified": 0
   },
   "SL": {
    "n": 570,
    "take": 284,
    "swing": 286,
    "calledStrike": 87,
    "ball": 195,
    "hbp": 2,
    "whiff": 112,
    "foul": 92,
    "inPlay": 82,
    "pop": 3,
    "weakGb": 24,
    "hardGb": 16,
    "line": 18,
    "weakFb": 12,
    "hardFb": 8,
    "unclassified": 0
   },
   "CH": {
    "n": 312,
    "take": 161,
    "swing": 151,
    "calledStrike": 46,
    "ball": 114,
    "hbp": 1,
    "whiff": 49,
    "foul": 51,
    "inPlay": 51,
    "pop": 2,
    "weakGb": 14,
    "hardGb": 11,
    "line": 11,
    "weakFb": 7,
    "hardFb": 6,
    "unclassified": 0
   },
   "CU": {
    "n": 147,
    "take": 75,
    "swing": 72,
    "calledStrike": 24,
    "ball": 51,
    "hbp": 1,
    "whiff": 22,
    "foul": 25,
    "inPlay": 25,
    "pop": 1,
    "weakGb": 6,
    "hardGb": 4,
    "line": 6,
    "weakFb": 4,
    "hardFb": 3,
    "unclassified": 0
   }
  },
  "league": {
   "FF": {
    "ivb": 17.0,
    "hb": 7.0,
    "rpm": 2400
   },
   "SI": {
    "ivb": 9.0,
    "hb": 15.5,
    "rpm": 2200
   },
   "FC": {
    "ivb": 10.0,
    "hb": -2.0,
    "rpm": 2350
   },
   "SL": {
    "ivb": 1.5,
    "hb": -5.0,
    "rpm": 2450
   },
   "ST": {
    "ivb": 1.0,
    "hb": -16.0,
    "rpm": 2550
   },
   "CU": {
    "ivb": -9.5,
    "hb": -7.0,
    "rpm": 2600
   },
   "CH": {
    "ivb": 6.0,
    "hb": 15.0,
    "rpm": 1800
   },
   "FS": {
    "ivb": 4.0,
    "hb": 12.5,
    "rpm": 1400
   }
  }
 },
 "900002": {
  "id": 900002,
  "hand": "L",
  "pitchGrades": [
   {
    "type": "FF",
    "pitches": 501,
    "usage": 38,
    "velo": 94.1,
    "ivb": 16.6,
    "hb": 6.4,
    "spin": 2347,
    "actual": -0.17,
    "expected": 0.21,
    "note": null,
    "stuff": 109,
    "command": 100,
    "overall": 104,
    "miss": 105,
    "chase": 105,
    "steal": 103,
    "gb": 90,
    "pop": 119,
    "weak": 113
   },
   {
    "type": "ST",
    "pitches": 343,
    "usage": 26,
    "velo": 80.4,
    "ivb": 1.4,
    "hb": -19.4,
    "spin": 2560,
    "actual": 0.16,
    "expected": 0.5,
    "note": "command still settling",
    "stuff": 121,
    "command": 98,
    "overall": 110,
    "miss": 122,
    "chase": 121,
    "steal": 108,
    "gb": 112,
    "pop": 108,
    "weak": 112
   },
   {
    "type": "CH",
    "pitches": 264,
    "usage": 20,
    "velo": 87.1,
    "ivb": 7.1,
    "hb": 15.4,
    "spin": 1717,
    "actual": 1.43,
    "expected": 0.41,
    "note": "command still settling",
    "stuff": 108,
    "command": 110,
    "overall": 106,
    "miss": 111,
    "chase": 114,
    "steal": 97,
    "gb": 116,
    "pop": 100,
    "weak": 106
   },
   {
    "type": "SI",
    "pitches": 211,
    "usage": 16,
    "velo": 93.2,
    "ivb": 9.7,
    "hb": 15.5,
    "spin": 2200,
    "actual": 0.7,
    "expected": 0.23,
    "note": "command still settling",
    "stuff": 97,
    "command": 108,
    "overall": 103,
    "miss": 87,
    "chase": 95,
    "steal": 102,
    "gb": 114,
    "pop": 97,
    "weak": 110
   }
  ],
  "pressure": [
   {
    "pressure": "high",
    "pitches": 224,
    "overall": 99,
    "command": 97,
    "fastballPct": 56,
    "actual": 0.47
   },
   {
    "pressure": "normal",
    "pitches": 1095,
    "overall": 108,
    "command": 105,
    "fastballPct": 54,
    "actual": 0.73
   }
  ],
  "shape": {
   "FF": {
    "n": 501,
    "velo": 94.1,
    "ivb": 16.6,
    "hb": 6.4,
    "rpm": 2347,
    "points": [
     {
      "hb": 4.8,
      "ivb": 16.0
     },
     {
      "hb": 7.8,
      "ivb": 16.8
     },
     {
      "hb": 5.0,
      "ivb": 15.3
     },
     {
      "hb": 10.7,
      "ivb": 18.4
     },
     {
      "hb": 7.4,
      "ivb": 12.5
     },
     {
      "hb": 7.4,
      "ivb": 17.4
     },
     {
      "hb": 9.1,
      "ivb": 17.3
     },
     {
      "hb": 6.3,
      "ivb": 17.4
     },
     {
      "hb": 3.3,
      "ivb": 18.3
     },
     {
      "hb": 6.9,
      "ivb": 15.5
     },
     {
      "hb": 8.5,
      "ivb": 19.5
     },
     {
      "hb": 4.2,
      "ivb": 15.5
     },
     {
      "hb": 6.9,
      "ivb": 16.9
     },
     {
      "hb": 5.8,
      "ivb": 15.0
     },
     {
      "hb": 9.8,
      "ivb": 18.3
     },
     {
      "hb": 4.5,
      "ivb": 14.4
     },
     {
      "hb": 9.1,
      "ivb": 18.2
     },
     {
      "hb": 9.3,
      "ivb": 17.9
     },
     {
      "hb": 5.0,
      "ivb": 17.0
     },
     {
      "hb": 2.9,
      "ivb": 15.4
     },
     {
      "hb": 6.3,
      "ivb": 17.4
     },
     {
      "hb": 5.2,
      "ivb": 16.4
     },
     {
      "hb": 7.1,
      "ivb": 17.2
     },
     {
      "hb": 7.4,
      "ivb": 16.9
     },
     {
      "hb": 5.9,
      "ivb": 17.9
     },
     {
      "hb": 6.5,
      "ivb": 15.3
     },
     {
      "hb": 5.4,
      "ivb": 16.6
     },
     {
      "hb": 6.2,
      "ivb": 16.9
     },
     {
      "hb": 6.4,
      "ivb": 16.9
     },
     {
      "hb": 6.2,
      "ivb": 14.6
     },
     {
      "hb": 7.1,
      "ivb": 18.3
     },
     {
      "hb": 7.1,
      "ivb": 16.3
     },
     {
      "hb": 7.1,
      "ivb": 15.1
     },
     {
      "hb": 3.4,
      "ivb": 16.7
     },
     {
      "hb": 4.9,
      "ivb": 17.8
     },
     {
      "hb": 4.7,
      "ivb": 12.4
     },
     {
      "hb": 4.7,
      "ivb": 19.1
     },
     {
      "hb": 5.8,
      "ivb": 14.4
     },
     {
      "hb": 5.2,
      "ivb": 17.4
     },
     {
      "hb": 7.2,
      "ivb": 16.9
     }
    ]
   },
   "ST": {
    "n": 343,
    "velo": 80.4,
    "ivb": 1.4,
    "hb": -19.4,
    "rpm": 2560,
    "points": [
     {
      "hb": -17.0,
      "ivb": 2.5
     },
     {
      "hb": -19.4,
      "ivb": 2.4
     },
     {
      "hb": -16.8,
      "ivb": 3.0
     },
     {
      "hb": -17.8,
      "ivb": -0.3
     },
     {
      "hb": -19.6,
      "ivb": 2.6
     },
     {
      "hb": -19.9,
      "ivb": 3.1
     },
     {
      "hb": -18.4,
      "ivb": 2.9
     },
     {
      "hb": -19.7,
      "ivb": 5.5
     },
     {
      "hb": -17.4,
      "ivb": 1.1
     },
     {
      "hb": -19.3,
      "ivb": 5.6
     },
     {
      "hb": -19.9,
      "ivb": 2.8
     },
     {
      "hb": -17.8,
      "ivb": 1.4
     },
     {
      "hb": -21.3,
      "ivb": 1.7
     },
     {
      "hb": -18.8,
      "ivb": 3.2
     },
     {
      "hb": -18.1,
      "ivb": 1.4
     },
     {
      "hb": -18.0,
      "ivb": 2.3
     },
     {
      "hb": -19.1,
      "ivb": 1.5
     },
     {
      "hb": -19.8,
      "ivb": 2.5
     },
     {
      "hb": -21.1,
      "ivb": 0.4
     },
     {
      "hb": -19.4,
      "ivb": -0.9
     },
     {
      "hb": -20.1,
      "ivb": -1.8
     },
     {
      "hb": -20.5,
      "ivb": 2.3
     },
     {
      "hb": -18.5,
      "ivb": 1.3
     },
     {
      "hb": -19.8,
      "ivb": -0.9
     },
     {
      "hb": -16.5,
      "ivb": 2.2
     },
     {
      "hb": -17.7,
      "ivb": -0.0
     },
     {
      "hb": -19.7,
      "ivb": -1.5
     },
     {
      "hb": -18.2,
      "ivb": 2.9
     },
     {
      "hb": -22.4,
      "ivb": 1.3
     },
     {
      "hb": -18.4,
      "ivb": -1.4
     },
     {
      "hb": -22.3,
      "ivb": -0.3
     },
     {
      "hb": -20.4,
      "ivb": -0.8
     },
     {
      "hb": -19.3,
      "ivb": 1.8
     },
     {
      "hb": -18.4,
      "ivb": 2.5
     },
     {
      "hb": -17.0,
      "ivb": 3.3
     },
     {
      "hb": -21.5,
      "ivb": 0.6
     },
     {
      "hb": -21.1,
      "ivb": -0.3
     },
     {
      "hb": -19.5,
      "ivb": 1.4
     },
     {
      "hb": -18.6,
      "ivb": -1.1
     },
     {
      "hb": -21.4,
      "ivb": 1.4
     }
    ]
   },
   "CH": {
    "n": 264,
    "velo": 87.1,
    "ivb": 7.1,
    "hb": 15.4,
    "rpm": 1717,
    "points": [
     {
      "hb": 15.1,
      "ivb": 6.6
     },
     {
      "hb": 15.3,
      "ivb": 5.9
     },
     {
      "hb": 16.5,
      "ivb": 7.7
     },
     {
      "hb": 15.3,
      "ivb": 6.0
     },
     {
      "hb": 15.1,
      "ivb": 2.7
     },
     {
      "hb": 13.8,
      "ivb": 7.2
     },
     {
      "hb": 13.0,
      "ivb": 7.4
     },
     {
      "hb": 15.6,
      "ivb": 4.9
     },
     {
      "hb": 15.0,
      "ivb": 6.6
     },
     {
      "hb": 16.1,
      "ivb": 8.1
     },
     {
      "hb": 15.3,
      "ivb": 5.7
     },
     {
      "hb": 15.2,
      "ivb": 7.0
     },
     {
      "hb": 16.6,
      "ivb": 7.6
     },
     {
      "hb": 14.2,
      "ivb": 4.9
     },
     {
      "hb": 14.8,
      "ivb": 5.9
     },
     {
      "hb": 13.6,
      "ivb": 6.9
     },
     {
      "hb": 14.6,
      "ivb": 7.3
     },
     {
      "hb": 16.2,
      "ivb": 6.4
     },
     {
      "hb": 19.1,
      "ivb": 6.6
     },
     {
      "hb": 17.2,
      "ivb": 7.3
     },
     {
      "hb": 17.2,
      "ivb": 3.3
     },
     {
      "hb": 14.2,
      "ivb": 7.5
     },
     {
      "hb": 16.4,
      "ivb": 10.8
     },
     {
      "hb": 15.9,
      "ivb": 9.1
     },
     {
      "hb": 16.6,
      "ivb": 8.6
     },
     {
      "hb": 16.2,
      "ivb": 6.9
     },
     {
      "hb": 16.2,
      "ivb": 5.4
     },
     {
      "hb": 17.3,
      "ivb": 5.5
     },
     {
      "hb": 15.8,
      "ivb": 10.5
     },
     {
      "hb": 15.0,
      "ivb": 7.1
     },
     {
      "hb": 17.3,
      "ivb": 7.1
     },
     {
      "hb": 14.1,
      "ivb": 7.5
     },
     {
      "hb": 16.3,
      "ivb": 8.2
     },
     {
      "hb": 14.2,
      "ivb": 9.9
     },
     {
      "hb": 18.1,
      "ivb": 7.1
     },
     {
      "hb": 15.8,
      "ivb": 6.4
     },
     {
      "hb": 17.7,
      "ivb": 6.0
     },
     {
      "hb": 16.5,
      "ivb": 6.3
     },
     {
      "hb": 14.3,
      "ivb": 8.2
     },
     {
      "hb": 17.5,
      "ivb": 7.1
     }
    ]
   },
   "SI": {
    "n": 211,
    "velo": 93.2,
    "ivb": 9.7,
    "hb": 15.5,
    "rpm": 2200,
    "points": [
     {
      "hb": 14.4,
      "ivb": 11.0
     },
     {
      "hb": 15.4,
      "ivb": 10.2
     },
     {
      "hb": 17.9,
      "ivb": 11.5
     },
     {
      "hb": 14.7,
      "ivb": 13.4
     },
     {
      "hb": 15.5,
      "ivb": 11.0
     },
     {
      "hb": 14.5,
      "ivb": 9.6
     },
     {
      "hb": 12.7,
      "ivb": 12.6
     },
     {
      "hb": 17.7,
      "ivb": 7.8
     },
     {
      "hb": 13.1,
      "ivb": 7.1
     },
     {
      "hb": 17.4,
      "ivb": 9.0
     },
     {
      "hb": 15.4,
      "ivb": 9.2
     },
     {
      "hb": 15.3,
      "ivb": 8.0
     },
     {
      "hb": 15.5,
      "ivb": 7.4
     },
     {
      "hb": 15.4,
      "ivb": 10.2
     },
     {
      "hb": 16.2,
      "ivb": 9.3
     },
     {
      "hb": 14.1,
      "ivb": 10.0
     },
     {
      "hb": 14.7,
      "ivb": 12.2
     },
     {
      "hb": 16.7,
      "ivb": 9.5
     },
     {
      "hb": 14.7,
      "ivb": 8.6
     },
     {
      "hb": 14.0,
      "ivb": 9.1
     },
     {
      "hb": 16.0,
      "ivb": 10.5
     },
     {
      "hb": 16.4,
      "ivb": 13.1
     },
     {
      "hb": 14.4,
      "ivb": 9.7
     },
     {
      "hb": 20.0,
      "ivb": 6.7
     },
     {
      "hb": 14.7,
      "ivb": 10.0
     },
     {
      "hb": 15.7,
      "ivb": 10.4
     },
     {
      "hb": 15.1,
      "ivb": 10.3
     },
     {
      "hb": 15.6,
      "ivb": 10.9
     },
     {
      "hb": 12.5,
      "ivb": 8.3
     },
     {
      "hb": 15.5,
      "ivb": 8.0
     },
     {
      "hb": 13.8,
      "ivb": 10.7
     },
     {
      "hb": 14.5,
      "ivb": 10.7
     },
     {
      "hb": 16.7,
      "ivb": 10.2
     },
     {
      "hb": 16.3,
      "ivb": 9.5
     },
     {
      "hb": 13.2,
      "ivb": 9.7
     },
     {
      "hb": 16.2,
      "ivb": 8.9
     },
     {
      "hb": 15.3,
      "ivb": 10.9
     },
     {
      "hb": 14.1,
      "ivb": 10.7
     },
     {
      "hb": 18.5,
      "ivb": 8.8
     },
     {
      "hb": 15.7,
      "ivb": 9.5
     }
    ]
   }
  },
  "outcomes": {
   "FF": {
    "n": 501,
    "take": 263,
    "swing": 238,
    "calledStrike": 74,
    "ball": 187,
    "hbp": 2,
    "whiff": 64,
    "foul": 84,
    "inPlay": 90,
    "pop": 7,
    "weakGb": 20,
    "hardGb": 13,
    "line": 20,
    "weakFb": 18,
    "hardFb": 12,
    "unclassified": 0
   },
   "ST": {
    "n": 343,
    "take": 164,
    "swing": 179,
    "calledStrike": 49,
    "ball": 113,
    "hbp": 1,
    "whiff": 67,
    "foul": 59,
    "inPlay": 54,
    "pop": 3,
    "weakGb": 16,
    "hardGb": 11,
    "line": 12,
    "weakFb": 7,
    "hardFb": 5,
    "unclassified": 0
   },
   "CH": {
    "n": 264,
    "take": 131,
    "swing": 133,
    "calledStrike": 34,
    "ball": 97,
    "hbp": 1,
    "whiff": 41,
    "foul": 46,
    "inPlay": 46,
    "pop": 2,
    "weakGb": 13,
    "hardGb": 11,
    "line": 10,
    "weakFb": 5,
    "hardFb": 4,
    "unclassified": 0
   },
   "SI": {
    "n": 211,
    "take": 117,
    "swing": 94,
    "calledStrike": 33,
    "ball": 84,
    "hbp": 1,
    "whiff": 15,
    "foul": 36,
    "inPlay": 43,
    "pop": 1,
    "weakGb": 13,
    "hardGb": 9,
    "line": 9,
    "weakFb": 6,
    "hardFb": 4,
    "unclassified": 0
   }
  },
  "league": {
   "FF": {
    "ivb": 17.0,
    "hb": 7.0,
    "rpm": 2400
   },
   "SI": {
    "ivb": 9.0,
    "hb": 15.5,
    "rpm": 2200
   },
   "FC": {
    "ivb": 10.0,
    "hb": -2.0,
    "rpm": 2350
   },
   "SL": {
    "ivb": 1.5,
    "hb": -5.0,
    "rpm": 2450
   },
   "ST": {
    "ivb": 1.0,
    "hb": -16.0,
    "rpm": 2550
   },
   "CU": {
    "ivb": -9.5,
    "hb": -7.0,
    "rpm": 2600
   },
   "CH": {
    "ivb": 6.0,
    "hb": 15.0,
    "rpm": 1800
   },
   "FS": {
    "ivb": 4.0,
    "hb": 12.5,
    "rpm": 1400
   }
  }
 },
 "900003": {
  "id": 900003,
  "hand": "R",
  "pitchGrades": [
   {
    "type": "SI",
    "pitches": 373,
    "usage": 41,
    "velo": 93.9,
    "ivb": 8.4,
    "hb": 15.8,
    "spin": 2291,
    "actual": -0.28,
    "expected": -0.27,
    "note": "command still settling",
    "stuff": 94,
    "command": 99,
    "overall": 95,
    "miss": 82,
    "chase": 97,
    "steal": 104,
    "gb": 107,
    "pop": 88,
    "weak": 107
   },
   {
    "type": "SL",
    "pitches": 218,
    "usage": 24,
    "velo": 85.9,
    "ivb": 0.1,
    "hb": -4.9,
    "spin": 2461,
    "actual": 1.4,
    "expected": 0.82,
    "note": "command still settling",
    "stuff": 118,
    "command": 109,
    "overall": 114,
    "miss": 123,
    "chase": 116,
    "steal": 99,
    "gb": 115,
    "pop": 94,
    "weak": 110
   },
   {
    "type": "CH",
    "pitches": 200,
    "usage": 22,
    "velo": 85.8,
    "ivb": 6.5,
    "hb": 16.9,
    "spin": 1771,
    "actual": 1.18,
    "expected": 0.7,
    "note": "command still settling",
    "stuff": 103,
    "command": 118,
    "overall": 110,
    "miss": 111,
    "chase": 105,
    "steal": 105,
    "gb": 112,
    "pop": 102,
    "weak": 106
   },
   {
    "type": "FC",
    "pitches": 118,
    "usage": 13,
    "velo": 89.7,
    "ivb": 9.8,
    "hb": -4.8,
    "spin": 2312,
    "actual": 0.55,
    "expected": 0.25,
    "note": "very small sample",
    "stuff": 102,
    "command": 109,
    "overall": 103,
    "miss": 100,
    "chase": 100,
    "steal": 107,
    "gb": 104,
    "pop": 101,
    "weak": 109
   }
  ],
  "pressure": [
   {
    "pressure": "high",
    "pitches": 154,
    "overall": 98,
    "command": 102,
    "fastballPct": 59,
    "actual": 0.4
   },
   {
    "pressure": "normal",
    "pitches": 755,
    "overall": 108,
    "command": 110,
    "fastballPct": 55,
    "actual": 0.46
   }
  ],
  "shape": {
   "SI": {
    "n": 373,
    "velo": 93.9,
    "ivb": 8.4,
    "hb": 15.8,
    "rpm": 2291,
    "points": [
     {
      "hb": 18.3,
      "ivb": 8.9
     },
     {
      "hb": 17.2,
      "ivb": 7.3
     },
     {
      "hb": 15.8,
      "ivb": 8.4
     },
     {
      "hb": 13.0,
      "ivb": 10.7
     },
     {
      "hb": 17.2,
      "ivb": 5.6
     },
     {
      "hb": 17.0,
      "ivb": 8.2
     },
     {
      "hb": 16.5,
      "ivb": 9.0
     },
     {
      "hb": 13.4,
      "ivb": 8.1
     },
     {
      "hb": 18.2,
      "ivb": 7.5
     },
     {
      "hb": 14.2,
      "ivb": 6.2
     },
     {
      "hb": 13.8,
      "ivb": 8.9
     },
     {
      "hb": 18.5,
      "ivb": 9.1
     },
     {
      "hb": 16.2,
      "ivb": 12.0
     },
     {
      "hb": 15.0,
      "ivb": 7.3
     },
     {
      "hb": 16.6,
      "ivb": 9.3
     },
     {
      "hb": 14.2,
      "ivb": 6.5
     },
     {
      "hb": 16.3,
      "ivb": 8.8
     },
     {
      "hb": 13.7,
      "ivb": 8.1
     },
     {
      "hb": 14.9,
      "ivb": 9.1
     },
     {
      "hb": 15.6,
      "ivb": 8.3
     },
     {
      "hb": 15.2,
      "ivb": 10.1
     },
     {
      "hb": 18.0,
      "ivb": 7.8
     },
     {
      "hb": 17.2,
      "ivb": 7.2
     },
     {
      "hb": 15.9,
      "ivb": 9.6
     },
     {
      "hb": 18.2,
      "ivb": 7.8
     },
     {
      "hb": 15.7,
      "ivb": 8.7
     },
     {
      "hb": 13.4,
      "ivb": 8.4
     },
     {
      "hb": 14.7,
      "ivb": 9.0
     },
     {
      "hb": 14.0,
      "ivb": 5.2
     },
     {
      "hb": 15.9,
      "ivb": 8.8
     },
     {
      "hb": 14.9,
      "ivb": 9.8
     },
     {
      "hb": 15.4,
      "ivb": 7.4
     },
     {
      "hb": 16.6,
      "ivb": 5.9
     },
     {
      "hb": 14.7,
      "ivb": 8.4
     },
     {
      "hb": 17.2,
      "ivb": 8.1
     },
     {
      "hb": 16.3,
      "ivb": 7.4
     },
     {
      "hb": 16.3,
      "ivb": 11.1
     },
     {
      "hb": 14.7,
      "ivb": 12.2
     },
     {
      "hb": 14.8,
      "ivb": 8.4
     },
     {
      "hb": 16.1,
      "ivb": 10.0
     }
    ]
   },
   "SL": {
    "n": 218,
    "velo": 85.9,
    "ivb": 0.1,
    "hb": -4.9,
    "rpm": 2461,
    "points": [
     {
      "hb": -6.9,
      "ivb": -3.3
     },
     {
      "hb": -3.9,
      "ivb": 1.4
     },
     {
      "hb": -3.9,
      "ivb": 4.3
     },
     {
      "hb": -4.6,
      "ivb": 0.5
     },
     {
      "hb": -3.4,
      "ivb": 0.7
     },
     {
      "hb": -2.2,
      "ivb": -1.9
     },
     {
      "hb": -5.5,
      "ivb": -5.4
     },
     {
      "hb": -3.6,
      "ivb": -0.5
     },
     {
      "hb": -3.4,
      "ivb": 3.5
     },
     {
      "hb": -4.9,
      "ivb": -0.3
     },
     {
      "hb": -5.7,
      "ivb": -1.2
     },
     {
      "hb": -5.9,
      "ivb": 1.1
     },
     {
      "hb": -4.8,
      "ivb": 0.2
     },
     {
      "hb": -5.2,
      "ivb": 1.6
     },
     {
      "hb": -4.1,
      "ivb": -0.1
     },
     {
      "hb": -3.8,
      "ivb": -0.1
     },
     {
      "hb": -6.7,
      "ivb": 2.4
     },
     {
      "hb": -4.2,
      "ivb": -1.4
     },
     {
      "hb": -3.2,
      "ivb": 0.7
     },
     {
      "hb": -7.4,
      "ivb": 2.7
     },
     {
      "hb": -4.4,
      "ivb": 1.5
     },
     {
      "hb": -4.6,
      "ivb": -0.1
     },
     {
      "hb": -7.4,
      "ivb": 1.7
     },
     {
      "hb": -4.9,
      "ivb": -0.4
     },
     {
      "hb": -4.3,
      "ivb": 0.2
     },
     {
      "hb": -3.8,
      "ivb": -0.5
     },
     {
      "hb": -5.0,
      "ivb": -3.3
     },
     {
      "hb": -5.6,
      "ivb": 1.2
     },
     {
      "hb": -2.8,
      "ivb": -0.5
     },
     {
      "hb": -5.1,
      "ivb": 2.6
     },
     {
      "hb": -5.4,
      "ivb": 1.3
     },
     {
      "hb": -2.2,
      "ivb": 0.2
     },
     {
      "hb": -2.9,
      "ivb": -1.0
     },
     {
      "hb": -4.6,
      "ivb": -0.0
     },
     {
      "hb": -4.7,
      "ivb": 1.9
     },
     {
      "hb": -1.1,
      "ivb": -1.0
     },
     {
      "hb": -5.8,
      "ivb": 0.9
     },
     {
      "hb": -6.6,
      "ivb": 0.9
     },
     {
      "hb": -4.0,
      "ivb": -0.3
     },
     {
      "hb": -4.1,
      "ivb": -2.4
     }
    ]
   },
   "CH": {
    "n": 200,
    "velo": 85.8,
    "ivb": 6.5,
    "hb": 16.9,
    "rpm": 1771,
    "points": [
     {
      "hb": 18.1,
      "ivb": 4.0
     },
     {
      "hb": 15.8,
      "ivb": 5.6
     },
     {
      "hb": 16.3,
      "ivb": 7.9
     },
     {
      "hb": 17.0,
      "ivb": 5.9
     },
     {
      "hb": 17.8,
      "ivb": 9.0
     },
     {
      "hb": 16.9,
      "ivb": 7.1
     },
     {
      "hb": 18.9,
      "ivb": 6.9
     },
     {
      "hb": 14.8,
      "ivb": 10.5
     },
     {
      "hb": 20.4,
      "ivb": 3.3
     },
     {
      "hb": 16.8,
      "ivb": 7.2
     },
     {
      "hb": 18.4,
      "ivb": 7.6
     },
     {
      "hb": 16.5,
      "ivb": 4.8
     },
     {
      "hb": 17.1,
      "ivb": 8.2
     },
     {
      "hb": 15.2,
      "ivb": 4.9
     },
     {
      "hb": 16.9,
      "ivb": 3.4
     },
     {
      "hb": 16.5,
      "ivb": 5.8
     },
     {
      "hb": 17.6,
      "ivb": 5.4
     },
     {
      "hb": 15.5,
      "ivb": 5.9
     },
     {
      "hb": 16.8,
      "ivb": 5.4
     },
     {
      "hb": 16.9,
      "ivb": 7.7
     },
     {
      "hb": 18.8,
      "ivb": 9.2
     },
     {
      "hb": 15.6,
      "ivb": 5.8
     },
     {
      "hb": 12.9,
      "ivb": 9.5
     },
     {
      "hb": 15.7,
      "ivb": 6.4
     },
     {
      "hb": 17.7,
      "ivb": 4.3
     },
     {
      "hb": 17.6,
      "ivb": 6.5
     },
     {
      "hb": 14.0,
      "ivb": 7.0
     },
     {
      "hb": 18.8,
      "ivb": 3.5
     },
     {
      "hb": 18.2,
      "ivb": 6.8
     },
     {
      "hb": 17.7,
      "ivb": 7.2
     },
     {
      "hb": 19.0,
      "ivb": 6.1
     },
     {
      "hb": 18.3,
      "ivb": 5.8
     },
     {
      "hb": 18.1,
      "ivb": 5.2
     },
     {
      "hb": 16.7,
      "ivb": 9.3
     },
     {
      "hb": 17.6,
      "ivb": 6.2
     },
     {
      "hb": 15.1,
      "ivb": 5.2
     },
     {
      "hb": 17.2,
      "ivb": 8.0
     },
     {
      "hb": 17.6,
      "ivb": 7.3
     },
     {
      "hb": 16.8,
      "ivb": 8.7
     },
     {
      "hb": 16.3,
      "ivb": 5.6
     }
    ]
   },
   "FC": {
    "n": 118,
    "velo": 89.7,
    "ivb": 9.8,
    "hb": -4.8,
    "rpm": 2312,
    "points": [
     {
      "hb": -3.4,
      "ivb": 9.9
     },
     {
      "hb": -5.2,
      "ivb": 8.9
     },
     {
      "hb": -5.2,
      "ivb": 10.8
     },
     {
      "hb": -4.2,
      "ivb": 7.9
     },
     {
      "hb": -4.1,
      "ivb": 10.1
     },
     {
      "hb": -6.4,
      "ivb": 11.0
     },
     {
      "hb": -5.2,
      "ivb": 9.3
     },
     {
      "hb": -3.5,
      "ivb": 11.9
     },
     {
      "hb": -5.9,
      "ivb": 10.5
     },
     {
      "hb": -6.2,
      "ivb": 13.5
     },
     {
      "hb": -5.6,
      "ivb": 11.7
     },
     {
      "hb": -5.8,
      "ivb": 11.1
     },
     {
      "hb": -1.2,
      "ivb": 5.7
     },
     {
      "hb": -5.5,
      "ivb": 10.6
     },
     {
      "hb": -4.9,
      "ivb": 8.7
     },
     {
      "hb": -1.4,
      "ivb": 9.9
     },
     {
      "hb": -7.4,
      "ivb": 11.2
     },
     {
      "hb": -7.6,
      "ivb": 11.6
     },
     {
      "hb": -5.7,
      "ivb": 10.0
     },
     {
      "hb": -2.8,
      "ivb": 10.0
     },
     {
      "hb": -7.0,
      "ivb": 7.1
     },
     {
      "hb": -2.9,
      "ivb": 11.0
     },
     {
      "hb": -6.1,
      "ivb": 11.2
     },
     {
      "hb": -4.0,
      "ivb": 10.8
     },
     {
      "hb": -8.4,
      "ivb": 9.3
     },
     {
      "hb": -3.4,
      "ivb": 11.0
     },
     {
      "hb": -3.4,
      "ivb": 5.9
     },
     {
      "hb": -4.5,
      "ivb": 10.6
     },
     {
      "hb": -0.7,
      "ivb": 8.3
     },
     {
      "hb": -5.3,
      "ivb": 9.9
     },
     {
      "hb": -3.4,
      "ivb": 9.1
     },
     {
      "hb": -3.0,
      "ivb": 8.5
     },
     {
      "hb": -4.4,
      "ivb": 9.0
     },
     {
      "hb": -4.5,
      "ivb": 8.7
     },
     {
      "hb": -7.4,
      "ivb": 11.5
     },
     {
      "hb": -4.3,
      "ivb": 8.9
     },
     {
      "hb": -4.5,
      "ivb": 11.4
     },
     {
      "hb": -6.4,
      "ivb": 9.6
     },
     {
      "hb": -3.9,
      "ivb": 10.6
     },
     {
      "hb": -5.3,
      "ivb": 6.4
     }
    ]
   }
  },
  "outcomes": {
   "SI": {
    "n": 373,
    "take": 205,
    "swing": 168,
    "calledStrike": 59,
    "ball": 145,
    "hbp": 2,
    "whiff": 22,
    "foul": 65,
    "inPlay": 81,
    "pop": 2,
    "weakGb": 21,
    "hardGb": 17,
    "line": 18,
    "weakFb": 13,
    "hardFb": 10,
    "unclassified": 0
   },
   "SL": {
    "n": 218,
    "take": 107,
    "swing": 111,
    "calledStrike": 29,
    "ball": 78,
    "hbp": 1,
    "whiff": 42,
    "foul": 36,
    "inPlay": 33,
    "pop": 1,
    "weakGb": 10,
    "hardGb": 7,
    "line": 7,
    "weakFb": 4,
    "hardFb": 3,
    "unclassified": 0
   },
   "CH": {
    "n": 200,
    "take": 105,
    "swing": 95,
    "calledStrike": 30,
    "ball": 74,
    "hbp": 1,
    "whiff": 29,
    "foul": 33,
    "inPlay": 33,
    "pop": 1,
    "weakGb": 9,
    "hardGb": 7,
    "line": 7,
    "weakFb": 4,
    "hardFb": 3,
    "unclassified": 0
   },
   "FC": {
    "n": 118,
    "take": 64,
    "swing": 54,
    "calledStrike": 19,
    "ball": 44,
    "hbp": 1,
    "whiff": 13,
    "foul": 20,
    "inPlay": 22,
    "pop": 1,
    "weakGb": 6,
    "hardGb": 4,
    "line": 5,
    "weakFb": 4,
    "hardFb": 3,
    "unclassified": 0
   }
  },
  "league": {
   "FF": {
    "ivb": 17.0,
    "hb": 7.0,
    "rpm": 2400
   },
   "SI": {
    "ivb": 9.0,
    "hb": 15.5,
    "rpm": 2200
   },
   "FC": {
    "ivb": 10.0,
    "hb": -2.0,
    "rpm": 2350
   },
   "SL": {
    "ivb": 1.5,
    "hb": -5.0,
    "rpm": 2450
   },
   "ST": {
    "ivb": 1.0,
    "hb": -16.0,
    "rpm": 2550
   },
   "CU": {
    "ivb": -9.5,
    "hb": -7.0,
    "rpm": 2600
   },
   "CH": {
    "ivb": 6.0,
    "hb": 15.0,
    "rpm": 1800
   },
   "FS": {
    "ivb": 4.0,
    "hb": 12.5,
    "rpm": 1400
   }
  }
 },
 "900004": {
  "id": 900004,
  "hand": "R",
  "pitchGrades": [
   {
    "type": "FF",
    "pitches": 310,
    "usage": 50,
    "velo": 94.9,
    "ivb": 18.0,
    "hb": 6.9,
    "spin": 2481,
    "actual": -0.05,
    "expected": -0.11,
    "note": "command still settling",
    "stuff": 108,
    "command": 94,
    "overall": 99,
    "miss": 103,
    "chase": 104,
    "steal": 112,
    "gb": 91,
    "pop": 121,
    "weak": 101
   },
   {
    "type": "FS",
    "pitches": 167,
    "usage": 27,
    "velo": 87.8,
    "ivb": 7.0,
    "hb": 14.1,
    "spin": 1330,
    "actual": -0.51,
    "expected": 0.38,
    "note": "command still settling",
    "stuff": 124,
    "command": 91,
    "overall": 109,
    "miss": 125,
    "chase": 120,
    "steal": 106,
    "gb": 125,
    "pop": 97,
    "weak": 119
   },
   {
    "type": "SL",
    "pitches": 142,
    "usage": 23,
    "velo": 86.6,
    "ivb": 2.7,
    "hb": -6.8,
    "spin": 2418,
    "actual": 0.41,
    "expected": 0.68,
    "note": "command still settling",
    "stuff": 120,
    "command": 101,
    "overall": 113,
    "miss": 119,
    "chase": 125,
    "steal": 107,
    "gb": 117,
    "pop": 108,
    "weak": 107
   }
  ],
  "pressure": [
   {
    "pressure": "high",
    "pitches": 105,
    "overall": 103,
    "command": 94,
    "fastballPct": 56,
    "actual": -0.41
   },
   {
    "pressure": "normal",
    "pitches": 514,
    "overall": 108,
    "command": 98,
    "fastballPct": 51,
    "actual": 0.05
   }
  ],
  "shape": {
   "FF": {
    "n": 310,
    "velo": 94.9,
    "ivb": 18.0,
    "hb": 6.9,
    "rpm": 2481,
    "points": [
     {
      "hb": 8.9,
      "ivb": 18.5
     },
     {
      "hb": 6.9,
      "ivb": 17.6
     },
     {
      "hb": 7.3,
      "ivb": 17.3
     },
     {
      "hb": 5.3,
      "ivb": 16.8
     },
     {
      "hb": 5.9,
      "ivb": 17.0
     },
     {
      "hb": 5.0,
      "ivb": 19.0
     },
     {
      "hb": 4.8,
      "ivb": 19.1
     },
     {
      "hb": 5.3,
      "ivb": 18.6
     },
     {
      "hb": 9.1,
      "ivb": 18.3
     },
     {
      "hb": 5.7,
      "ivb": 18.1
     },
     {
      "hb": 7.1,
      "ivb": 15.2
     },
     {
      "hb": 5.9,
      "ivb": 18.3
     },
     {
      "hb": 6.1,
      "ivb": 18.1
     },
     {
      "hb": 8.1,
      "ivb": 19.2
     },
     {
      "hb": 8.3,
      "ivb": 18.9
     },
     {
      "hb": 6.4,
      "ivb": 18.0
     },
     {
      "hb": 6.5,
      "ivb": 17.5
     },
     {
      "hb": 6.6,
      "ivb": 15.2
     },
     {
      "hb": 6.4,
      "ivb": 18.0
     },
     {
      "hb": 5.3,
      "ivb": 18.0
     },
     {
      "hb": 7.7,
      "ivb": 17.7
     },
     {
      "hb": 10.2,
      "ivb": 13.8
     },
     {
      "hb": 6.6,
      "ivb": 15.1
     },
     {
      "hb": 8.5,
      "ivb": 22.2
     },
     {
      "hb": 2.9,
      "ivb": 18.2
     },
     {
      "hb": 7.7,
      "ivb": 17.5
     },
     {
      "hb": 7.8,
      "ivb": 14.4
     },
     {
      "hb": 8.3,
      "ivb": 18.6
     },
     {
      "hb": 6.9,
      "ivb": 17.1
     },
     {
      "hb": 7.9,
      "ivb": 17.2
     },
     {
      "hb": 7.3,
      "ivb": 17.2
     },
     {
      "hb": 3.3,
      "ivb": 17.9
     },
     {
      "hb": 7.2,
      "ivb": 19.2
     },
     {
      "hb": 5.5,
      "ivb": 17.9
     },
     {
      "hb": 7.9,
      "ivb": 18.2
     },
     {
      "hb": 8.9,
      "ivb": 21.2
     },
     {
      "hb": 5.4,
      "ivb": 14.9
     },
     {
      "hb": 8.3,
      "ivb": 20.4
     },
     {
      "hb": 8.4,
      "ivb": 19.3
     },
     {
      "hb": 5.9,
      "ivb": 16.9
     }
    ]
   },
   "FS": {
    "n": 167,
    "velo": 87.8,
    "ivb": 7.0,
    "hb": 14.1,
    "rpm": 1330,
    "points": [
     {
      "hb": 15.5,
      "ivb": 5.5
     },
     {
      "hb": 11.2,
      "ivb": 5.4
     },
     {
      "hb": 18.1,
      "ivb": 10.1
     },
     {
      "hb": 13.0,
      "ivb": 5.8
     },
     {
      "hb": 14.5,
      "ivb": 5.8
     },
     {
      "hb": 16.2,
      "ivb": 6.9
     },
     {
      "hb": 12.4,
      "ivb": 9.1
     },
     {
      "hb": 13.2,
      "ivb": 7.4
     },
     {
      "hb": 14.1,
      "ivb": 6.5
     },
     {
      "hb": 14.6,
      "ivb": 5.9
     },
     {
      "hb": 11.1,
      "ivb": 3.5
     },
     {
      "hb": 12.1,
      "ivb": 5.8
     },
     {
      "hb": 14.1,
      "ivb": 7.1
     },
     {
      "hb": 15.0,
      "ivb": 7.2
     },
     {
      "hb": 12.8,
      "ivb": 5.9
     },
     {
      "hb": 10.7,
      "ivb": 6.7
     },
     {
      "hb": 14.9,
      "ivb": 7.8
     },
     {
      "hb": 13.9,
      "ivb": 6.7
     },
     {
      "hb": 15.6,
      "ivb": 7.0
     },
     {
      "hb": 15.3,
      "ivb": 7.9
     },
     {
      "hb": 14.4,
      "ivb": 9.1
     },
     {
      "hb": 13.2,
      "ivb": 6.4
     },
     {
      "hb": 12.8,
      "ivb": 5.7
     },
     {
      "hb": 16.6,
      "ivb": 9.8
     },
     {
      "hb": 14.1,
      "ivb": 7.9
     },
     {
      "hb": 16.0,
      "ivb": 8.3
     },
     {
      "hb": 16.0,
      "ivb": 5.0
     },
     {
      "hb": 13.1,
      "ivb": 7.7
     },
     {
      "hb": 16.4,
      "ivb": 7.2
     },
     {
      "hb": 12.7,
      "ivb": 6.4
     },
     {
      "hb": 13.0,
      "ivb": 5.6
     },
     {
      "hb": 16.5,
      "ivb": 6.0
     },
     {
      "hb": 14.1,
      "ivb": 10.5
     },
     {
      "hb": 16.0,
      "ivb": 7.5
     },
     {
      "hb": 13.1,
      "ivb": 7.7
     },
     {
      "hb": 16.7,
      "ivb": 8.0
     },
     {
      "hb": 16.1,
      "ivb": 7.2
     },
     {
      "hb": 14.9,
      "ivb": 6.7
     },
     {
      "hb": 14.8,
      "ivb": 9.1
     },
     {
      "hb": 11.8,
      "ivb": 6.9
     }
    ]
   },
   "SL": {
    "n": 142,
    "velo": 86.6,
    "ivb": 2.7,
    "hb": -6.8,
    "rpm": 2418,
    "points": [
     {
      "hb": -6.4,
      "ivb": 1.8
     },
     {
      "hb": -7.3,
      "ivb": 4.0
     },
     {
      "hb": -3.6,
      "ivb": 3.7
     },
     {
      "hb": -6.3,
      "ivb": 0.2
     },
     {
      "hb": -3.7,
      "ivb": 2.8
     },
     {
      "hb": -6.9,
      "ivb": 0.9
     },
     {
      "hb": -6.9,
      "ivb": 0.9
     },
     {
      "hb": -6.7,
      "ivb": 3.4
     },
     {
      "hb": -6.8,
      "ivb": 3.1
     },
     {
      "hb": -8.2,
      "ivb": 5.0
     },
     {
      "hb": -7.8,
      "ivb": -0.2
     },
     {
      "hb": -7.1,
      "ivb": 1.5
     },
     {
      "hb": -8.4,
      "ivb": 2.1
     },
     {
      "hb": -6.3,
      "ivb": 0.8
     },
     {
      "hb": -7.0,
      "ivb": 5.0
     },
     {
      "hb": -5.7,
      "ivb": 2.5
     },
     {
      "hb": -6.6,
      "ivb": 2.5
     },
     {
      "hb": -6.9,
      "ivb": 3.9
     },
     {
      "hb": -6.9,
      "ivb": -1.1
     },
     {
      "hb": -6.8,
      "ivb": 1.3
     },
     {
      "hb": -5.8,
      "ivb": 1.7
     },
     {
      "hb": -6.6,
      "ivb": 6.2
     },
     {
      "hb": -8.5,
      "ivb": 0.9
     },
     {
      "hb": -9.1,
      "ivb": -1.1
     },
     {
      "hb": -9.8,
      "ivb": 3.3
     },
     {
      "hb": -7.8,
      "ivb": -0.3
     },
     {
      "hb": -9.2,
      "ivb": 3.7
     },
     {
      "hb": -8.0,
      "ivb": 2.1
     },
     {
      "hb": -6.3,
      "ivb": 4.9
     },
     {
      "hb": -3.7,
      "ivb": 4.4
     },
     {
      "hb": -6.6,
      "ivb": 3.0
     },
     {
      "hb": -3.9,
      "ivb": 5.0
     },
     {
      "hb": -7.3,
      "ivb": 3.4
     },
     {
      "hb": -6.3,
      "ivb": 2.8
     },
     {
      "hb": -7.6,
      "ivb": 0.6
     },
     {
      "hb": -7.7,
      "ivb": 0.2
     },
     {
      "hb": -4.8,
      "ivb": 3.6
     },
     {
      "hb": -8.7,
      "ivb": 4.9
     },
     {
      "hb": -5.4,
      "ivb": -0.4
     },
     {
      "hb": -3.9,
      "ivb": 4.0
     }
    ]
   }
  },
  "outcomes": {
   "FF": {
    "n": 310,
    "take": 164,
    "swing": 146,
    "calledStrike": 52,
    "ball": 110,
    "hbp": 1,
    "whiff": 38,
    "foul": 52,
    "inPlay": 57,
    "pop": 5,
    "weakGb": 11,
    "hardGb": 11,
    "line": 13,
    "weakFb": 9,
    "hardFb": 9,
    "unclassified": 0
   },
   "FS": {
    "n": 167,
    "take": 80,
    "swing": 87,
    "calledStrike": 24,
    "ball": 56,
    "hbp": 1,
    "whiff": 34,
    "foul": 28,
    "inPlay": 25,
    "pop": 1,
    "weakGb": 9,
    "hardGb": 5,
    "line": 6,
    "weakFb": 3,
    "hardFb": 1,
    "unclassified": 0
   },
   "SL": {
    "n": 142,
    "take": 66,
    "swing": 76,
    "calledStrike": 20,
    "ball": 46,
    "hbp": 1,
    "whiff": 27,
    "foul": 25,
    "inPlay": 24,
    "pop": 1,
    "weakGb": 7,
    "hardGb": 6,
    "line": 5,
    "weakFb": 3,
    "hardFb": 2,
    "unclassified": 0
   }
  },
  "league": {
   "FF": {
    "ivb": 17.0,
    "hb": 7.0,
    "rpm": 2400
   },
   "SI": {
    "ivb": 9.0,
    "hb": 15.5,
    "rpm": 2200
   },
   "FC": {
    "ivb": 10.0,
    "hb": -2.0,
    "rpm": 2350
   },
   "SL": {
    "ivb": 1.5,
    "hb": -5.0,
    "rpm": 2450
   },
   "ST": {
    "ivb": 1.0,
    "hb": -16.0,
    "rpm": 2550
   },
   "CU": {
    "ivb": -9.5,
    "hb": -7.0,
    "rpm": 2600
   },
   "CH": {
    "ivb": 6.0,
    "hb": 15.0,
    "rpm": 1800
   },
   "FS": {
    "ivb": 4.0,
    "hb": 12.5,
    "rpm": 1400
   }
  }
 },
 "900005": {
  "id": 900005,
  "hand": "L",
  "pitchGrades": [
   {
    "type": "SI",
    "pitches": 220,
    "usage": 46,
    "velo": 93.8,
    "ivb": 10.0,
    "hb": 15.5,
    "spin": 2225,
    "actual": 0.78,
    "expected": -0.16,
    "note": "command still settling",
    "stuff": 92,
    "command": 105,
    "overall": 96,
    "miss": 80,
    "chase": 93,
    "steal": 97,
    "gb": 109,
    "pop": 86,
    "weak": 101
   },
   {
    "type": "CH",
    "pitches": 144,
    "usage": 30,
    "velo": 86.8,
    "ivb": 5.6,
    "hb": 15.4,
    "spin": 1705,
    "actual": -0.59,
    "expected": 0.01,
    "note": "command still settling",
    "stuff": 89,
    "command": 112,
    "overall": 98,
    "miss": 98,
    "chase": 104,
    "steal": 92,
    "gb": 102,
    "pop": 95,
    "weak": 98
   },
   {
    "type": "CU",
    "pitches": 115,
    "usage": 24,
    "velo": 78.6,
    "ivb": -12.0,
    "hb": -9.8,
    "spin": 2708,
    "actual": -1.0,
    "expected": -0.08,
    "note": "very small sample",
    "stuff": 99,
    "command": 97,
    "overall": 99,
    "miss": 102,
    "chase": 106,
    "steal": 116,
    "gb": 113,
    "pop": 96,
    "weak": 104
   }
  ],
  "pressure": [
   {
    "pressure": "high",
    "pitches": 81,
    "overall": 92,
    "command": 101,
    "fastballPct": 53,
    "actual": -0.41
   },
   {
    "pressure": "normal",
    "pitches": 398,
    "overall": 97,
    "command": 105,
    "fastballPct": 45,
    "actual": -0.25
   }
  ],
  "shape": {
   "SI": {
    "n": 220,
    "velo": 93.8,
    "ivb": 10.0,
    "hb": 15.5,
    "rpm": 2225,
    "points": [
     {
      "hb": 18.8,
      "ivb": 8.0
     },
     {
      "hb": 16.3,
      "ivb": 10.7
     },
     {
      "hb": 15.8,
      "ivb": 10.3
     },
     {
      "hb": 17.2,
      "ivb": 7.6
     },
     {
      "hb": 13.5,
      "ivb": 7.8
     },
     {
      "hb": 14.6,
      "ivb": 9.0
     },
     {
      "hb": 16.1,
      "ivb": 10.4
     },
     {
      "hb": 15.6,
      "ivb": 8.9
     },
     {
      "hb": 14.8,
      "ivb": 11.5
     },
     {
      "hb": 16.7,
      "ivb": 10.2
     },
     {
      "hb": 15.0,
      "ivb": 12.5
     },
     {
      "hb": 14.5,
      "ivb": 11.0
     },
     {
      "hb": 17.3,
      "ivb": 9.6
     },
     {
      "hb": 16.8,
      "ivb": 8.2
     },
     {
      "hb": 17.1,
      "ivb": 10.3
     },
     {
      "hb": 13.0,
      "ivb": 11.1
     },
     {
      "hb": 14.1,
      "ivb": 12.1
     },
     {
      "hb": 14.4,
      "ivb": 9.7
     },
     {
      "hb": 16.0,
      "ivb": 9.5
     },
     {
      "hb": 15.9,
      "ivb": 9.1
     },
     {
      "hb": 16.6,
      "ivb": 10.0
     },
     {
      "hb": 15.8,
      "ivb": 5.6
     },
     {
      "hb": 17.4,
      "ivb": 10.1
     },
     {
      "hb": 12.6,
      "ivb": 10.2
     },
     {
      "hb": 16.2,
      "ivb": 11.7
     },
     {
      "hb": 13.8,
      "ivb": 12.5
     },
     {
      "hb": 15.2,
      "ivb": 13.8
     },
     {
      "hb": 15.3,
      "ivb": 11.1
     },
     {
      "hb": 14.9,
      "ivb": 8.2
     },
     {
      "hb": 17.3,
      "ivb": 11.5
     },
     {
      "hb": 18.0,
      "ivb": 11.4
     },
     {
      "hb": 14.6,
      "ivb": 7.3
     },
     {
      "hb": 14.5,
      "ivb": 8.9
     },
     {
      "hb": 14.2,
      "ivb": 10.9
     },
     {
      "hb": 16.0,
      "ivb": 9.6
     },
     {
      "hb": 15.8,
      "ivb": 9.8
     },
     {
      "hb": 15.8,
      "ivb": 11.2
     },
     {
      "hb": 17.0,
      "ivb": 8.9
     },
     {
      "hb": 13.1,
      "ivb": 12.3
     },
     {
      "hb": 15.7,
      "ivb": 11.8
     }
    ]
   },
   "CH": {
    "n": 144,
    "velo": 86.8,
    "ivb": 5.6,
    "hb": 15.4,
    "rpm": 1705,
    "points": [
     {
      "hb": 12.8,
      "ivb": 5.1
     },
     {
      "hb": 15.4,
      "ivb": 3.3
     },
     {
      "hb": 14.6,
      "ivb": 6.8
     },
     {
      "hb": 17.1,
      "ivb": 8.2
     },
     {
      "hb": 14.0,
      "ivb": 3.4
     },
     {
      "hb": 16.2,
      "ivb": 7.1
     },
     {
      "hb": 15.7,
      "ivb": 3.5
     },
     {
      "hb": 16.7,
      "ivb": 6.9
     },
     {
      "hb": 16.3,
      "ivb": 4.8
     },
     {
      "hb": 15.9,
      "ivb": 6.9
     },
     {
      "hb": 14.5,
      "ivb": 2.7
     },
     {
      "hb": 15.9,
      "ivb": 6.4
     },
     {
      "hb": 15.4,
      "ivb": 7.0
     },
     {
      "hb": 14.5,
      "ivb": 5.5
     },
     {
      "hb": 14.9,
      "ivb": 6.5
     },
     {
      "hb": 18.0,
      "ivb": 5.2
     },
     {
      "hb": 18.7,
      "ivb": 8.0
     },
     {
      "hb": 16.7,
      "ivb": 6.5
     },
     {
      "hb": 18.2,
      "ivb": 5.3
     },
     {
      "hb": 15.2,
      "ivb": 3.9
     },
     {
      "hb": 16.2,
      "ivb": 7.8
     },
     {
      "hb": 16.3,
      "ivb": 6.3
     },
     {
      "hb": 15.1,
      "ivb": 5.9
     },
     {
      "hb": 13.1,
      "ivb": 7.3
     },
     {
      "hb": 14.7,
      "ivb": 3.8
     },
     {
      "hb": 14.2,
      "ivb": 4.3
     },
     {
      "hb": 16.8,
      "ivb": 7.3
     },
     {
      "hb": 13.2,
      "ivb": 7.1
     },
     {
      "hb": 16.8,
      "ivb": 4.7
     },
     {
      "hb": 13.0,
      "ivb": 4.4
     },
     {
      "hb": 14.4,
      "ivb": 6.1
     },
     {
      "hb": 14.8,
      "ivb": 2.4
     },
     {
      "hb": 15.8,
      "ivb": 3.1
     },
     {
      "hb": 16.8,
      "ivb": 3.7
     },
     {
      "hb": 14.3,
      "ivb": 4.2
     },
     {
      "hb": 14.5,
      "ivb": 7.7
     },
     {
      "hb": 16.8,
      "ivb": 6.6
     },
     {
      "hb": 15.9,
      "ivb": 3.1
     },
     {
      "hb": 14.6,
      "ivb": 4.7
     },
     {
      "hb": 13.8,
      "ivb": 6.4
     }
    ]
   },
   "CU": {
    "n": 115,
    "velo": 78.6,
    "ivb": -12.0,
    "hb": -9.8,
    "rpm": 2708,
    "points": [
     {
      "hb": -11.0,
      "ivb": -13.1
     },
     {
      "hb": -11.5,
      "ivb": -15.3
     },
     {
      "hb": -8.8,
      "ivb": -9.9
     },
     {
      "hb": -9.5,
      "ivb": -13.6
     },
     {
      "hb": -14.1,
      "ivb": -11.7
     },
     {
      "hb": -7.9,
      "ivb": -11.5
     },
     {
      "hb": -8.3,
      "ivb": -9.6
     },
     {
      "hb": -8.0,
      "ivb": -12.7
     },
     {
      "hb": -8.1,
      "ivb": -10.8
     },
     {
      "hb": -12.3,
      "ivb": -12.6
     },
     {
      "hb": -12.1,
      "ivb": -12.2
     },
     {
      "hb": -8.9,
      "ivb": -13.7
     },
     {
      "hb": -13.1,
      "ivb": -9.9
     },
     {
      "hb": -9.2,
      "ivb": -9.6
     },
     {
      "hb": -11.9,
      "ivb": -10.3
     },
     {
      "hb": -6.5,
      "ivb": -8.8
     },
     {
      "hb": -10.1,
      "ivb": -11.6
     },
     {
      "hb": -10.0,
      "ivb": -10.4
     },
     {
      "hb": -8.1,
      "ivb": -11.9
     },
     {
      "hb": -12.0,
      "ivb": -10.8
     },
     {
      "hb": -10.6,
      "ivb": -11.0
     },
     {
      "hb": -9.4,
      "ivb": -9.4
     },
     {
      "hb": -8.0,
      "ivb": -12.7
     },
     {
      "hb": -9.2,
      "ivb": -9.2
     },
     {
      "hb": -10.7,
      "ivb": -11.3
     },
     {
      "hb": -7.9,
      "ivb": -10.0
     },
     {
      "hb": -9.0,
      "ivb": -14.1
     },
     {
      "hb": -11.8,
      "ivb": -11.6
     },
     {
      "hb": -9.2,
      "ivb": -7.9
     },
     {
      "hb": -11.2,
      "ivb": -10.2
     },
     {
      "hb": -8.6,
      "ivb": -14.7
     },
     {
      "hb": -11.1,
      "ivb": -11.7
     },
     {
      "hb": -10.6,
      "ivb": -12.2
     },
     {
      "hb": -9.0,
      "ivb": -13.3
     },
     {
      "hb": -9.1,
      "ivb": -13.0
     },
     {
      "hb": -10.7,
      "ivb": -11.1
     },
     {
      "hb": -10.7,
      "ivb": -11.5
     },
     {
      "hb": -7.2,
      "ivb": -12.0
     },
     {
      "hb": -10.0,
      "ivb": -10.8
     },
     {
      "hb": -10.4,
      "ivb": -10.3
     }
    ]
   }
  },
  "outcomes": {
   "SI": {
    "n": 220,
    "take": 123,
    "swing": 97,
    "calledStrike": 32,
    "ball": 91,
    "hbp": 1,
    "whiff": 12,
    "foul": 38,
    "inPlay": 47,
    "pop": 1,
    "weakGb": 12,
    "hardGb": 11,
    "line": 10,
    "weakFb": 7,
    "hardFb": 6,
    "unclassified": 0
   },
   "CH": {
    "n": 144,
    "take": 76,
    "swing": 68,
    "calledStrike": 18,
    "ball": 57,
    "hbp": 1,
    "whiff": 15,
    "foul": 25,
    "inPlay": 28,
    "pop": 1,
    "weakGb": 6,
    "hardGb": 6,
    "line": 6,
    "weakFb": 4,
    "hardFb": 4,
    "unclassified": 0
   },
   "CU": {
    "n": 115,
    "take": 60,
    "swing": 55,
    "calledStrike": 20,
    "ball": 39,
    "hbp": 0,
    "whiff": 14,
    "foul": 20,
    "inPlay": 21,
    "pop": 1,
    "weakGb": 6,
    "hardGb": 5,
    "line": 5,
    "weakFb": 3,
    "hardFb": 2,
    "unclassified": 0
   }
  },
  "league": {
   "FF": {
    "ivb": 17.0,
    "hb": 7.0,
    "rpm": 2400
   },
   "SI": {
    "ivb": 9.0,
    "hb": 15.5,
    "rpm": 2200
   },
   "FC": {
    "ivb": 10.0,
    "hb": -2.0,
    "rpm": 2350
   },
   "SL": {
    "ivb": 1.5,
    "hb": -5.0,
    "rpm": 2450
   },
   "ST": {
    "ivb": 1.0,
    "hb": -16.0,
    "rpm": 2550
   },
   "CU": {
    "ivb": -9.5,
    "hb": -7.0,
    "rpm": 2600
   },
   "CH": {
    "ivb": 6.0,
    "hb": 15.0,
    "rpm": 1800
   },
   "FS": {
    "ivb": 4.0,
    "hb": 12.5,
    "rpm": 1400
   }
  }
 },
 "900006": {
  "id": 900006,
  "hand": "R",
  "pitchGrades": [
   {
    "type": "FF",
    "pitches": 170,
    "usage": 55,
    "velo": 96.2,
    "ivb": 18.1,
    "hb": 7.6,
    "spin": 2424,
    "actual": 0.04,
    "expected": 0.34,
    "note": "command still settling",
    "stuff": 110,
    "command": 98,
    "overall": 107,
    "miss": 110,
    "chase": 97,
    "steal": 115,
    "gb": 92,
    "pop": 118,
    "weak": 97
   },
   {
    "type": "SL",
    "pitches": 102,
    "usage": 33,
    "velo": 86.3,
    "ivb": 2.6,
    "hb": -6.8,
    "spin": 2311,
    "actual": 0.75,
    "expected": 0.58,
    "note": "very small sample",
    "stuff": 113,
    "command": 106,
    "overall": 110,
    "miss": 120,
    "chase": 115,
    "steal": 103,
    "gb": 108,
    "pop": 103,
    "weak": 106
   },
   {
    "type": "CH",
    "pitches": 27,
    "usage": 9,
    "velo": 84.6,
    "ivb": 4.7,
    "hb": 12.9,
    "spin": 1766,
    "actual": 1.0,
    "expected": -0.1,
    "note": "very small sample",
    "stuff": 101,
    "command": 95,
    "overall": 99,
    "miss": 111,
    "chase": 112,
    "steal": 99,
    "gb": 103,
    "pop": 101,
    "weak": 103
   },
   {
    "type": "CU",
    "pitches": 9,
    "usage": 3,
    "velo": 80.8,
    "ivb": -9.8,
    "hb": -4.8,
    "spin": 2477,
    "actual": 0.19,
    "expected": 0.27,
    "note": "very small sample",
    "stuff": 112,
    "command": 96,
    "overall": 106,
    "miss": 116,
    "chase": 112,
    "steal": 115,
    "gb": 112,
    "pop": 104,
    "weak": 119
   }
  ],
  "pressure": [
   {
    "pressure": "high",
    "pitches": 52,
    "overall": 107,
    "command": 100,
    "fastballPct": 58,
    "actual": 0.67
   },
   {
    "pressure": "normal",
    "pitches": 256,
    "overall": 106,
    "command": 99,
    "fastballPct": 55,
    "actual": 0.83
   }
  ],
  "shape": {
   "FF": {
    "n": 170,
    "velo": 96.2,
    "ivb": 18.1,
    "hb": 7.6,
    "rpm": 2424,
    "points": [
     {
      "hb": 5.5,
      "ivb": 19.1
     },
     {
      "hb": 6.8,
      "ivb": 16.8
     },
     {
      "hb": 10.4,
      "ivb": 16.7
     },
     {
      "hb": 10.4,
      "ivb": 19.2
     },
     {
      "hb": 9.9,
      "ivb": 16.5
     },
     {
      "hb": 9.5,
      "ivb": 20.4
     },
     {
      "hb": 7.4,
      "ivb": 17.9
     },
     {
      "hb": 11.5,
      "ivb": 18.4
     },
     {
      "hb": 6.9,
      "ivb": 17.1
     },
     {
      "hb": 8.3,
      "ivb": 18.6
     },
     {
      "hb": 7.9,
      "ivb": 20.9
     },
     {
      "hb": 7.1,
      "ivb": 18.9
     },
     {
      "hb": 9.9,
      "ivb": 16.5
     },
     {
      "hb": 9.3,
      "ivb": 21.0
     },
     {
      "hb": 5.4,
      "ivb": 16.3
     },
     {
      "hb": 5.9,
      "ivb": 15.1
     },
     {
      "hb": 8.3,
      "ivb": 15.1
     },
     {
      "hb": 8.4,
      "ivb": 20.4
     },
     {
      "hb": 5.0,
      "ivb": 17.6
     },
     {
      "hb": 4.5,
      "ivb": 19.3
     },
     {
      "hb": 6.4,
      "ivb": 17.7
     },
     {
      "hb": 7.7,
      "ivb": 19.0
     },
     {
      "hb": 7.0,
      "ivb": 18.1
     },
     {
      "hb": 6.7,
      "ivb": 18.3
     },
     {
      "hb": 5.7,
      "ivb": 18.2
     },
     {
      "hb": 4.5,
      "ivb": 17.3
     },
     {
      "hb": 10.7,
      "ivb": 18.2
     },
     {
      "hb": 5.6,
      "ivb": 18.5
     },
     {
      "hb": 6.0,
      "ivb": 15.5
     },
     {
      "hb": 6.4,
      "ivb": 19.3
     },
     {
      "hb": 8.2,
      "ivb": 17.9
     },
     {
      "hb": 6.1,
      "ivb": 16.4
     },
     {
      "hb": 9.8,
      "ivb": 18.5
     },
     {
      "hb": 6.1,
      "ivb": 14.7
     },
     {
      "hb": 5.4,
      "ivb": 22.1
     },
     {
      "hb": 5.8,
      "ivb": 18.0
     },
     {
      "hb": 7.9,
      "ivb": 17.8
     },
     {
      "hb": 7.2,
      "ivb": 15.9
     },
     {
      "hb": 5.9,
      "ivb": 20.8
     },
     {
      "hb": 6.4,
      "ivb": 19.5
     }
    ]
   },
   "SL": {
    "n": 102,
    "velo": 86.3,
    "ivb": 2.6,
    "hb": -6.8,
    "rpm": 2311,
    "points": [
     {
      "hb": -9.5,
      "ivb": 2.2
     },
     {
      "hb": -6.4,
      "ivb": 4.3
     },
     {
      "hb": -8.6,
      "ivb": 3.6
     },
     {
      "hb": -6.2,
      "ivb": 1.4
     },
     {
      "hb": -6.0,
      "ivb": 1.2
     },
     {
      "hb": -8.1,
      "ivb": 2.6
     },
     {
      "hb": -11.1,
      "ivb": 2.4
     },
     {
      "hb": -8.4,
      "ivb": 0.3
     },
     {
      "hb": -7.5,
      "ivb": 3.8
     },
     {
      "hb": -7.4,
      "ivb": 4.6
     },
     {
      "hb": -8.7,
      "ivb": 0.5
     },
     {
      "hb": -4.3,
      "ivb": 3.2
     },
     {
      "hb": -5.3,
      "ivb": 1.3
     },
     {
      "hb": -5.5,
      "ivb": 3.0
     },
     {
      "hb": -5.8,
      "ivb": 2.6
     },
     {
      "hb": -4.9,
      "ivb": 1.6
     },
     {
      "hb": -8.3,
      "ivb": 0.2
     },
     {
      "hb": -4.9,
      "ivb": 1.4
     },
     {
      "hb": -8.5,
      "ivb": 1.1
     },
     {
      "hb": -7.5,
      "ivb": 0.6
     },
     {
      "hb": -7.3,
      "ivb": 1.6
     },
     {
      "hb": -7.7,
      "ivb": 1.1
     },
     {
      "hb": -6.7,
      "ivb": 1.9
     },
     {
      "hb": -6.6,
      "ivb": 3.0
     },
     {
      "hb": -6.3,
      "ivb": -0.9
     },
     {
      "hb": -7.7,
      "ivb": 1.3
     },
     {
      "hb": -5.6,
      "ivb": 0.1
     },
     {
      "hb": -7.9,
      "ivb": 2.1
     },
     {
      "hb": -7.3,
      "ivb": 4.2
     },
     {
      "hb": -7.5,
      "ivb": 4.1
     },
     {
      "hb": -9.1,
      "ivb": -0.3
     },
     {
      "hb": -4.8,
      "ivb": 3.3
     },
     {
      "hb": -6.0,
      "ivb": 2.8
     },
     {
      "hb": -6.0,
      "ivb": 0.7
     },
     {
      "hb": -5.3,
      "ivb": 1.7
     },
     {
      "hb": -5.2,
      "ivb": 2.7
     },
     {
      "hb": -10.0,
      "ivb": 0.5
     },
     {
      "hb": -5.0,
      "ivb": 2.4
     },
     {
      "hb": -7.4,
      "ivb": 3.0
     },
     {
      "hb": -7.5,
      "ivb": 1.7
     }
    ]
   },
   "CH": {
    "n": 27,
    "velo": 84.6,
    "ivb": 4.7,
    "hb": 12.9,
    "rpm": 1766,
    "points": [
     {
      "hb": 13.1,
      "ivb": 4.9
     },
     {
      "hb": 15.3,
      "ivb": 4.8
     },
     {
      "hb": 15.9,
      "ivb": 7.6
     },
     {
      "hb": 15.6,
      "ivb": 6.4
     },
     {
      "hb": 13.1,
      "ivb": 4.9
     },
     {
      "hb": 12.7,
      "ivb": 3.5
     },
     {
      "hb": 12.8,
      "ivb": 3.7
     },
     {
      "hb": 15.5,
      "ivb": 5.6
     },
     {
      "hb": 12.2,
      "ivb": 1.6
     },
     {
      "hb": 12.8,
      "ivb": 4.0
     },
     {
      "hb": 11.2,
      "ivb": 2.9
     },
     {
      "hb": 9.3,
      "ivb": 5.6
     },
     {
      "hb": 12.8,
      "ivb": 8.8
     },
     {
      "hb": 12.9,
      "ivb": 4.5
     },
     {
      "hb": 15.2,
      "ivb": 4.9
     },
     {
      "hb": 13.2,
      "ivb": 4.1
     },
     {
      "hb": 11.9,
      "ivb": 7.1
     },
     {
      "hb": 14.5,
      "ivb": 7.4
     },
     {
      "hb": 12.3,
      "ivb": 4.7
     },
     {
      "hb": 11.5,
      "ivb": 6.2
     },
     {
      "hb": 10.7,
      "ivb": 5.6
     },
     {
      "hb": 14.7,
      "ivb": 7.0
     },
     {
      "hb": 11.4,
      "ivb": 6.4
     },
     {
      "hb": 11.8,
      "ivb": 3.5
     },
     {
      "hb": 10.8,
      "ivb": 6.5
     },
     {
      "hb": 15.5,
      "ivb": 3.7
     },
     {
      "hb": 11.7,
      "ivb": 4.2
     },
     {
      "hb": 16.9,
      "ivb": 6.3
     },
     {
      "hb": 12.0,
      "ivb": 1.8
     },
     {
      "hb": 11.8,
      "ivb": 6.6
     },
     {
      "hb": 15.9,
      "ivb": 4.3
     },
     {
      "hb": 11.8,
      "ivb": 3.9
     },
     {
      "hb": 9.9,
      "ivb": 6.2
     },
     {
      "hb": 11.2,
      "ivb": 6.4
     },
     {
      "hb": 10.2,
      "ivb": 2.7
     },
     {
      "hb": 13.4,
      "ivb": 3.5
     },
     {
      "hb": 14.2,
      "ivb": 4.7
     },
     {
      "hb": 11.0,
      "ivb": 5.7
     },
     {
      "hb": 14.2,
      "ivb": 1.6
     },
     {
      "hb": 15.8,
      "ivb": 5.5
     }
    ]
   },
   "CU": {
    "n": 9,
    "velo": 80.8,
    "ivb": -9.8,
    "hb": -4.8,
    "rpm": 2477,
    "points": [
     {
      "hb": -3.6,
      "ivb": -12.8
     },
     {
      "hb": -6.0,
      "ivb": -10.4
     },
     {
      "hb": -3.1,
      "ivb": -12.1
     },
     {
      "hb": -6.2,
      "ivb": -13.0
     },
     {
      "hb": -5.2,
      "ivb": -9.2
     },
     {
      "hb": -7.5,
      "ivb": -10.7
     },
     {
      "hb": -4.0,
      "ivb": -7.3
     },
     {
      "hb": -3.7,
      "ivb": -10.3
     },
     {
      "hb": -6.7,
      "ivb": -11.3
     },
     {
      "hb": -5.9,
      "ivb": -9.6
     },
     {
      "hb": -4.9,
      "ivb": -7.1
     },
     {
      "hb": -4.3,
      "ivb": -11.5
     },
     {
      "hb": -2.3,
      "ivb": -8.3
     },
     {
      "hb": -4.6,
      "ivb": -11.0
     },
     {
      "hb": -7.8,
      "ivb": -11.4
     },
     {
      "hb": -3.3,
      "ivb": -11.1
     },
     {
      "hb": -6.9,
      "ivb": -9.5
     },
     {
      "hb": -4.4,
      "ivb": -8.8
     },
     {
      "hb": -3.8,
      "ivb": -7.5
     },
     {
      "hb": -6.1,
      "ivb": -8.2
     },
     {
      "hb": -6.4,
      "ivb": -8.7
     },
     {
      "hb": -4.5,
      "ivb": -9.4
     },
     {
      "hb": -3.3,
      "ivb": -9.8
     },
     {
      "hb": -3.0,
      "ivb": -8.4
     },
     {
      "hb": -4.6,
      "ivb": -10.7
     },
     {
      "hb": -6.0,
      "ivb": -10.6
     },
     {
      "hb": -5.1,
      "ivb": -9.8
     },
     {
      "hb": -0.0,
      "ivb": -8.8
     },
     {
      "hb": -3.6,
      "ivb": -11.2
     },
     {
      "hb": -5.9,
      "ivb": -10.3
     },
     {
      "hb": -4.5,
      "ivb": -11.5
     },
     {
      "hb": -2.2,
      "ivb": -10.7
     },
     {
      "hb": -3.1,
      "ivb": -13.5
     },
     {
      "hb": -4.8,
      "ivb": -9.4
     },
     {
      "hb": -4.5,
      "ivb": -8.8
     },
     {
      "hb": -4.4,
      "ivb": -9.5
     },
     {
      "hb": -7.8,
      "ivb": -10.9
     },
     {
      "hb": -8.5,
      "ivb": -8.8
     },
     {
      "hb": -4.3,
      "ivb": -10.1
     },
     {
      "hb": -6.1,
      "ivb": -10.7
     }
    ]
   }
  },
  "outcomes": {
   "FF": {
    "n": 170,
    "take": 93,
    "swing": 77,
    "calledStrike": 31,
    "ball": 62,
    "hbp": 1,
    "whiff": 23,
    "foul": 26,
    "inPlay": 27,
    "pop": 2,
    "weakGb": 5,
    "hardGb": 5,
    "line": 6,
    "weakFb": 4,
    "hardFb": 5,
    "unclassified": 0
   },
   "SL": {
    "n": 102,
    "take": 50,
    "swing": 52,
    "calledStrike": 14,
    "ball": 36,
    "hbp": 0,
    "whiff": 19,
    "foul": 17,
    "inPlay": 16,
    "pop": 1,
    "weakGb": 4,
    "hardGb": 3,
    "line": 4,
    "weakFb": 2,
    "hardFb": 2,
    "unclassified": 0
   },
   "CH": {
    "n": 27,
    "take": 14,
    "swing": 13,
    "calledStrike": 4,
    "ball": 10,
    "hbp": 0,
    "whiff": 4,
    "foul": 5,
    "inPlay": 5,
    "pop": 0,
    "weakGb": 1,
    "hardGb": 1,
    "line": 1,
    "weakFb": 1,
    "hardFb": 1,
    "unclassified": 0
   },
   "CU": {
    "n": 9,
    "take": 5,
    "swing": 4,
    "calledStrike": 1,
    "ball": 3,
    "hbp": 0,
    "whiff": 1,
    "foul": 1,
    "inPlay": 1,
    "pop": 0,
    "weakGb": 0,
    "hardGb": 0,
    "line": 0,
    "weakFb": 0,
    "hardFb": 0,
    "unclassified": 0
   }
  },
  "league": {
   "FF": {
    "ivb": 17.0,
    "hb": 7.0,
    "rpm": 2400
   },
   "SI": {
    "ivb": 9.0,
    "hb": 15.5,
    "rpm": 2200
   },
   "FC": {
    "ivb": 10.0,
    "hb": -2.0,
    "rpm": 2350
   },
   "SL": {
    "ivb": 1.5,
    "hb": -5.0,
    "rpm": 2450
   },
   "ST": {
    "ivb": 1.0,
    "hb": -16.0,
    "rpm": 2550
   },
   "CU": {
    "ivb": -9.5,
    "hb": -7.0,
    "rpm": 2600
   },
   "CH": {
    "ivb": 6.0,
    "hb": 15.0,
    "rpm": 1800
   },
   "FS": {
    "ivb": 4.0,
    "hb": 12.5,
    "rpm": 1400
   }
  }
 },
 "900007": {
  "id": 900007,
  "hand": "R",
  "pitchGrades": [
   {
    "type": "FF",
    "pitches": 693,
    "usage": 42,
    "velo": 96.3,
    "ivb": 19.1,
    "hb": 9.6,
    "spin": 2360,
    "actual": -0.34,
    "expected": 0.42,
    "note": null,
    "stuff": 114,
    "command": 101,
    "overall": 108,
    "miss": 111,
    "chase": 99,
    "steal": 108,
    "gb": 98,
    "pop": 116,
    "weak": 107
   },
   {
    "type": "SL",
    "pitches": 495,
    "usage": 30,
    "velo": 86.1,
    "ivb": 1.6,
    "hb": -3.8,
    "spin": 2374,
    "actual": -1.71,
    "expected": 0.54,
    "note": null,
    "stuff": 125,
    "command": 91,
    "overall": 112,
    "miss": 121,
    "chase": 125,
    "steal": 112,
    "gb": 116,
    "pop": 104,
    "weak": 114
   },
   {
    "type": "FS",
    "pitches": 297,
    "usage": 18,
    "velo": 87.1,
    "ivb": 4.8,
    "hb": 14.4,
    "spin": 1424,
    "actual": -0.49,
    "expected": 0.24,
    "note": "command still settling",
    "stuff": 118,
    "command": 93,
    "overall": 106,
    "miss": 125,
    "chase": 113,
    "steal": 103,
    "gb": 125,
    "pop": 105,
    "weak": 119
   },
   {
    "type": "CU",
    "pitches": 165,
    "usage": 10,
    "velo": 78.6,
    "ivb": -9.3,
    "hb": -5.8,
    "spin": 2460,
    "actual": -0.77,
    "expected": 0.34,
    "note": "command still settling",
    "stuff": 119,
    "command": 92,
    "overall": 108,
    "miss": 119,
    "chase": 109,
    "steal": 125,
    "gb": 118,
    "pop": 114,
    "weak": 123
   }
  ],
  "pressure": [
   {
    "pressure": "high",
    "pitches": 280,
    "overall": 115,
    "command": 101,
    "fastballPct": 45,
    "actual": -0.98
   },
   {
    "pressure": "normal",
    "pitches": 1370,
    "overall": 112,
    "command": 98,
    "fastballPct": 43,
    "actual": -0.54
   }
  ],
  "shape": {
   "FF": {
    "n": 693,
    "velo": 96.3,
    "ivb": 19.1,
    "hb": 9.6,
    "rpm": 2360,
    "points": [
     {
      "hb": 12.6,
      "ivb": 21.9
     },
     {
      "hb": 9.5,
      "ivb": 21.2
     },
     {
      "hb": 7.1,
      "ivb": 16.0
     },
     {
      "hb": 8.8,
      "ivb": 17.7
     },
     {
      "hb": 8.7,
      "ivb": 19.4
     },
     {
      "hb": 14.4,
      "ivb": 18.0
     },
     {
      "hb": 9.7,
      "ivb": 19.5
     },
     {
      "hb": 9.5,
      "ivb": 20.6
     },
     {
      "hb": 12.4,
      "ivb": 17.1
     },
     {
      "hb": 9.9,
      "ivb": 18.7
     },
     {
      "hb": 10.2,
      "ivb": 16.6
     },
     {
      "hb": 6.8,
      "ivb": 15.4
     },
     {
      "hb": 10.4,
      "ivb": 19.4
     },
     {
      "hb": 9.7,
      "ivb": 15.3
     },
     {
      "hb": 9.0,
      "ivb": 17.9
     },
     {
      "hb": 7.3,
      "ivb": 17.6
     },
     {
      "hb": 10.7,
      "ivb": 20.0
     },
     {
      "hb": 9.6,
      "ivb": 19.9
     },
     {
      "hb": 8.6,
      "ivb": 19.2
     },
     {
      "hb": 9.7,
      "ivb": 20.0
     },
     {
      "hb": 9.5,
      "ivb": 18.9
     },
     {
      "hb": 9.4,
      "ivb": 18.1
     },
     {
      "hb": 13.2,
      "ivb": 19.9
     },
     {
      "hb": 10.3,
      "ivb": 22.8
     },
     {
      "hb": 11.8,
      "ivb": 16.6
     },
     {
      "hb": 10.7,
      "ivb": 20.4
     },
     {
      "hb": 12.6,
      "ivb": 21.2
     },
     {
      "hb": 10.8,
      "ivb": 17.2
     },
     {
      "hb": 8.2,
      "ivb": 19.5
     },
     {
      "hb": 10.4,
      "ivb": 17.5
     },
     {
      "hb": 9.0,
      "ivb": 18.5
     },
     {
      "hb": 9.7,
      "ivb": 19.6
     },
     {
      "hb": 9.1,
      "ivb": 17.1
     },
     {
      "hb": 11.6,
      "ivb": 21.7
     },
     {
      "hb": 9.4,
      "ivb": 20.7
     },
     {
      "hb": 10.3,
      "ivb": 20.2
     },
     {
      "hb": 10.4,
      "ivb": 17.9
     },
     {
      "hb": 10.5,
      "ivb": 20.7
     },
     {
      "hb": 8.2,
      "ivb": 22.2
     },
     {
      "hb": 12.9,
      "ivb": 22.0
     }
    ]
   },
   "SL": {
    "n": 495,
    "velo": 86.1,
    "ivb": 1.6,
    "hb": -3.8,
    "rpm": 2374,
    "points": [
     {
      "hb": -0.6,
      "ivb": 2.8
     },
     {
      "hb": -4.3,
      "ivb": 0.6
     },
     {
      "hb": -5.1,
      "ivb": 1.8
     },
     {
      "hb": -3.9,
      "ivb": 2.7
     },
     {
      "hb": -7.0,
      "ivb": 5.3
     },
     {
      "hb": -0.2,
      "ivb": 1.6
     },
     {
      "hb": -2.7,
      "ivb": 2.4
     },
     {
      "hb": -3.4,
      "ivb": 1.3
     },
     {
      "hb": -4.0,
      "ivb": 0.3
     },
     {
      "hb": -3.5,
      "ivb": 1.6
     },
     {
      "hb": -3.3,
      "ivb": 0.2
     },
     {
      "hb": -3.7,
      "ivb": 1.7
     },
     {
      "hb": -2.8,
      "ivb": -0.1
     },
     {
      "hb": -3.1,
      "ivb": 3.2
     },
     {
      "hb": -2.8,
      "ivb": 1.0
     },
     {
      "hb": -4.6,
      "ivb": 1.2
     },
     {
      "hb": -2.6,
      "ivb": 4.1
     },
     {
      "hb": -4.1,
      "ivb": 0.6
     },
     {
      "hb": -3.2,
      "ivb": 1.9
     },
     {
      "hb": -5.3,
      "ivb": 0.4
     },
     {
      "hb": -4.0,
      "ivb": 2.7
     },
     {
      "hb": -5.7,
      "ivb": -0.0
     },
     {
      "hb": -3.0,
      "ivb": -0.4
     },
     {
      "hb": -3.6,
      "ivb": 2.2
     },
     {
      "hb": -4.0,
      "ivb": -0.0
     },
     {
      "hb": -3.9,
      "ivb": 1.1
     },
     {
      "hb": -3.3,
      "ivb": 0.3
     },
     {
      "hb": -2.1,
      "ivb": -1.1
     },
     {
      "hb": -4.1,
      "ivb": 1.6
     },
     {
      "hb": -2.3,
      "ivb": 0.6
     },
     {
      "hb": -2.9,
      "ivb": 0.7
     },
     {
      "hb": -2.6,
      "ivb": 4.4
     },
     {
      "hb": -4.4,
      "ivb": 2.3
     },
     {
      "hb": -5.3,
      "ivb": 3.2
     },
     {
      "hb": -1.9,
      "ivb": 1.7
     },
     {
      "hb": -5.6,
      "ivb": 2.2
     },
     {
      "hb": -2.0,
      "ivb": 3.3
     },
     {
      "hb": -2.5,
      "ivb": -1.3
     },
     {
      "hb": -4.9,
      "ivb": 3.9
     },
     {
      "hb": -5.8,
      "ivb": 3.4
     }
    ]
   },
   "FS": {
    "n": 297,
    "velo": 87.1,
    "ivb": 4.8,
    "hb": 14.4,
    "rpm": 1424,
    "points": [
     {
      "hb": 17.4,
      "ivb": 6.0
     },
     {
      "hb": 16.2,
      "ivb": 4.3
     },
     {
      "hb": 12.4,
      "ivb": 4.6
     },
     {
      "hb": 14.1,
      "ivb": 4.7
     },
     {
      "hb": 15.5,
      "ivb": 4.6
     },
     {
      "hb": 14.7,
      "ivb": 5.5
     },
     {
      "hb": 14.4,
      "ivb": 7.7
     },
     {
      "hb": 15.1,
      "ivb": 4.9
     },
     {
      "hb": 14.1,
      "ivb": 3.8
     },
     {
      "hb": 16.6,
      "ivb": 5.0
     },
     {
      "hb": 12.7,
      "ivb": 3.9
     },
     {
      "hb": 14.2,
      "ivb": 4.1
     },
     {
      "hb": 16.1,
      "ivb": 2.9
     },
     {
      "hb": 15.2,
      "ivb": 5.0
     },
     {
      "hb": 12.5,
      "ivb": 4.9
     },
     {
      "hb": 14.2,
      "ivb": 5.6
     },
     {
      "hb": 13.7,
      "ivb": 5.3
     },
     {
      "hb": 11.7,
      "ivb": 3.1
     },
     {
      "hb": 15.7,
      "ivb": 6.5
     },
     {
      "hb": 14.4,
      "ivb": 3.8
     },
     {
      "hb": 16.1,
      "ivb": 1.5
     },
     {
      "hb": 13.1,
      "ivb": 5.9
     },
     {
      "hb": 15.4,
      "ivb": 3.1
     },
     {
      "hb": 11.4,
      "ivb": 7.1
     },
     {
      "hb": 14.6,
      "ivb": 3.4
     },
     {
      "hb": 14.5,
      "ivb": 6.2
     },
     {
      "hb": 10.3,
      "ivb": 6.6
     },
     {
      "hb": 15.6,
      "ivb": 1.5
     },
     {
      "hb": 15.6,
      "ivb": 2.0
     },
     {
      "hb": 16.2,
      "ivb": 5.4
     },
     {
      "hb": 18.0,
      "ivb": 3.8
     },
     {
      "hb": 14.4,
      "ivb": 6.5
     },
     {
      "hb": 13.4,
      "ivb": 3.7
     },
     {
      "hb": 13.8,
      "ivb": 4.7
     },
     {
      "hb": 12.7,
      "ivb": 5.6
     },
     {
      "hb": 15.3,
      "ivb": 4.9
     },
     {
      "hb": 17.1,
      "ivb": 4.3
     },
     {
      "hb": 16.5,
      "ivb": 3.9
     },
     {
      "hb": 15.6,
      "ivb": 1.7
     },
     {
      "hb": 14.7,
      "ivb": 4.5
     }
    ]
   },
   "CU": {
    "n": 165,
    "velo": 78.6,
    "ivb": -9.3,
    "hb": -5.8,
    "rpm": 2460,
    "points": [
     {
      "hb": -6.6,
      "ivb": -10.3
     },
     {
      "hb": -6.4,
      "ivb": -10.5
     },
     {
      "hb": -9.3,
      "ivb": -10.3
     },
     {
      "hb": -6.7,
      "ivb": -10.1
     },
     {
      "hb": -7.5,
      "ivb": -9.5
     },
     {
      "hb": -4.5,
      "ivb": -9.7
     },
     {
      "hb": -6.6,
      "ivb": -7.1
     },
     {
      "hb": -4.2,
      "ivb": -7.8
     },
     {
      "hb": -4.0,
      "ivb": -9.8
     },
     {
      "hb": -6.0,
      "ivb": -7.5
     },
     {
      "hb": -6.7,
      "ivb": -9.5
     },
     {
      "hb": -5.2,
      "ivb": -8.7
     },
     {
      "hb": -6.2,
      "ivb": -7.7
     },
     {
      "hb": -6.1,
      "ivb": -8.1
     },
     {
      "hb": -4.1,
      "ivb": -8.2
     },
     {
      "hb": -4.6,
      "ivb": -11.2
     },
     {
      "hb": -7.9,
      "ivb": -10.3
     },
     {
      "hb": -5.0,
      "ivb": -6.9
     },
     {
      "hb": -7.8,
      "ivb": -8.8
     },
     {
      "hb": -7.2,
      "ivb": -10.5
     },
     {
      "hb": -6.2,
      "ivb": -8.2
     },
     {
      "hb": -5.5,
      "ivb": -7.4
     },
     {
      "hb": -7.4,
      "ivb": -7.9
     },
     {
      "hb": -4.3,
      "ivb": -9.2
     },
     {
      "hb": -5.0,
      "ivb": -10.2
     },
     {
      "hb": -7.5,
      "ivb": -9.9
     },
     {
      "hb": -6.8,
      "ivb": -4.7
     },
     {
      "hb": -6.6,
      "ivb": -6.7
     },
     {
      "hb": -5.5,
      "ivb": -8.8
     },
     {
      "hb": -4.6,
      "ivb": -10.5
     },
     {
      "hb": -4.3,
      "ivb": -8.7
     },
     {
      "hb": -8.2,
      "ivb": -8.3
     },
     {
      "hb": -4.9,
      "ivb": -8.6
     },
     {
      "hb": -3.3,
      "ivb": -10.0
     },
     {
      "hb": -5.0,
      "ivb": -8.1
     },
     {
      "hb": -7.2,
      "ivb": -7.4
     },
     {
      "hb": -8.1,
      "ivb": -11.4
     },
     {
      "hb": -5.0,
      "ivb": -11.0
     },
     {
      "hb": -6.0,
      "ivb": -11.9
     },
     {
      "hb": -5.7,
      "ivb": -11.1
     }
    ]
   }
  },
  "outcomes": {
   "FF": {
    "n": 693,
    "take": 376,
    "swing": 317,
    "calledStrike": 114,
    "ball": 260,
    "hbp": 3,
    "whiff": 97,
    "foul": 109,
    "inPlay": 111,
    "pop": 8,
    "weakGb": 26,
    "hardGb": 21,
    "line": 24,
    "weakFb": 18,
    "hardFb": 14,
    "unclassified": 0
   },
   "SL": {
    "n": 495,
    "take": 230,
    "swing": 265,
    "calledStrike": 73,
    "ball": 155,
    "hbp": 2,
    "whiff": 97,
    "foul": 87,
    "inPlay": 81,
    "pop": 4,
    "weakGb": 26,
    "hardGb": 17,
    "line": 18,
    "weakFb": 10,
    "hardFb": 6,
    "unclassified": 0
   },
   "FS": {
    "n": 297,
    "take": 149,
    "swing": 148,
    "calledStrike": 42,
    "ball": 106,
    "hbp": 1,
    "whiff": 58,
    "foul": 48,
    "inPlay": 43,
    "pop": 2,
    "weakGb": 16,
    "hardGb": 9,
    "line": 9,
    "weakFb": 4,
    "hardFb": 2,
    "unclassified": 0
   },
   "CU": {
    "n": 165,
    "take": 85,
    "swing": 80,
    "calledStrike": 31,
    "ball": 53,
    "hbp": 1,
    "whiff": 28,
    "foul": 27,
    "inPlay": 25,
    "pop": 2,
    "weakGb": 9,
    "hardGb": 4,
    "line": 6,
    "weakFb": 3,
    "hardFb": 1,
    "unclassified": 0
   }
  },
  "league": {
   "FF": {
    "ivb": 17.0,
    "hb": 7.0,
    "rpm": 2400
   },
   "SI": {
    "ivb": 9.0,
    "hb": 15.5,
    "rpm": 2200
   },
   "FC": {
    "ivb": 10.0,
    "hb": -2.0,
    "rpm": 2350
   },
   "SL": {
    "ivb": 1.5,
    "hb": -5.0,
    "rpm": 2450
   },
   "ST": {
    "ivb": 1.0,
    "hb": -16.0,
    "rpm": 2550
   },
   "CU": {
    "ivb": -9.5,
    "hb": -7.0,
    "rpm": 2600
   },
   "CH": {
    "ivb": 6.0,
    "hb": 15.0,
    "rpm": 1800
   },
   "FS": {
    "ivb": 4.0,
    "hb": 12.5,
    "rpm": 1400
   }
  }
 },
 "900008": {
  "id": 900008,
  "hand": "L",
  "pitchGrades": [
   {
    "type": "SI",
    "pitches": 110,
    "usage": 58,
    "velo": 93.6,
    "ivb": 8.6,
    "hb": 17.2,
    "spin": 2192,
    "actual": 0.43,
    "expected": 0.15,
    "note": "very small sample",
    "stuff": 99,
    "command": 110,
    "overall": 101,
    "miss": 89,
    "chase": 97,
    "steal": 103,
    "gb": 113,
    "pop": 96,
    "weak": 106
   },
   {
    "type": "SL",
    "pitches": 79,
    "usage": 42,
    "velo": 85.1,
    "ivb": 0.3,
    "hb": -5.5,
    "spin": 2435,
    "actual": 0.21,
    "expected": 0.32,
    "note": "very small sample",
    "stuff": 117,
    "command": 95,
    "overall": 107,
    "miss": 125,
    "chase": 118,
    "steal": 104,
    "gb": 114,
    "pop": 102,
    "weak": 103
   }
  ],
  "pressure": [
   {
    "pressure": "high",
    "pitches": 32,
    "overall": 102,
    "command": 103,
    "fastballPct": 61,
    "actual": -0.18
   },
   {
    "pressure": "normal",
    "pitches": 157,
    "overall": 104,
    "command": 104,
    "fastballPct": 58,
    "actual": 0.16
   }
  ],
  "shape": {
   "SI": {
    "n": 110,
    "velo": 93.6,
    "ivb": 8.6,
    "hb": 17.2,
    "rpm": 2192,
    "points": [
     {
      "hb": 17.7,
      "ivb": 6.1
     },
     {
      "hb": 17.9,
      "ivb": 8.2
     },
     {
      "hb": 17.3,
      "ivb": 8.5
     },
     {
      "hb": 17.4,
      "ivb": 6.5
     },
     {
      "hb": 13.1,
      "ivb": 8.7
     },
     {
      "hb": 15.7,
      "ivb": 7.9
     },
     {
      "hb": 17.9,
      "ivb": 5.4
     },
     {
      "hb": 16.0,
      "ivb": 7.6
     },
     {
      "hb": 15.5,
      "ivb": 9.1
     },
     {
      "hb": 17.0,
      "ivb": 7.3
     },
     {
      "hb": 15.6,
      "ivb": 9.9
     },
     {
      "hb": 16.1,
      "ivb": 9.5
     },
     {
      "hb": 17.9,
      "ivb": 5.6
     },
     {
      "hb": 15.5,
      "ivb": 8.6
     },
     {
      "hb": 17.7,
      "ivb": 9.8
     },
     {
      "hb": 18.5,
      "ivb": 10.3
     },
     {
      "hb": 16.6,
      "ivb": 8.3
     },
     {
      "hb": 18.4,
      "ivb": 7.9
     },
     {
      "hb": 18.9,
      "ivb": 6.1
     },
     {
      "hb": 18.2,
      "ivb": 8.3
     },
     {
      "hb": 14.1,
      "ivb": 10.2
     },
     {
      "hb": 17.7,
      "ivb": 8.6
     },
     {
      "hb": 15.5,
      "ivb": 7.9
     },
     {
      "hb": 19.6,
      "ivb": 7.3
     },
     {
      "hb": 11.6,
      "ivb": 7.2
     },
     {
      "hb": 15.3,
      "ivb": 8.4
     },
     {
      "hb": 16.6,
      "ivb": 7.1
     },
     {
      "hb": 15.9,
      "ivb": 10.3
     },
     {
      "hb": 14.9,
      "ivb": 11.7
     },
     {
      "hb": 16.3,
      "ivb": 6.9
     },
     {
      "hb": 18.5,
      "ivb": 9.5
     },
     {
      "hb": 15.5,
      "ivb": 9.8
     },
     {
      "hb": 14.3,
      "ivb": 7.1
     },
     {
      "hb": 19.0,
      "ivb": 8.2
     },
     {
      "hb": 15.1,
      "ivb": 9.4
     },
     {
      "hb": 18.7,
      "ivb": 8.6
     },
     {
      "hb": 14.3,
      "ivb": 8.0
     },
     {
      "hb": 17.9,
      "ivb": 9.8
     },
     {
      "hb": 20.2,
      "ivb": 8.2
     },
     {
      "hb": 16.4,
      "ivb": 8.5
     }
    ]
   },
   "SL": {
    "n": 79,
    "velo": 85.1,
    "ivb": 0.3,
    "hb": -5.5,
    "rpm": 2435,
    "points": [
     {
      "hb": -3.6,
      "ivb": -1.2
     },
     {
      "hb": -3.4,
      "ivb": -4.1
     },
     {
      "hb": -4.2,
      "ivb": -0.8
     },
     {
      "hb": -4.8,
      "ivb": 1.4
     },
     {
      "hb": -7.4,
      "ivb": 0.2
     },
     {
      "hb": -5.1,
      "ivb": 1.2
     },
     {
      "hb": -7.0,
      "ivb": -1.3
     },
     {
      "hb": -8.6,
      "ivb": 4.4
     },
     {
      "hb": -5.8,
      "ivb": -0.1
     },
     {
      "hb": -7.9,
      "ivb": 1.8
     },
     {
      "hb": -6.4,
      "ivb": 2.6
     },
     {
      "hb": -4.1,
      "ivb": 0.3
     },
     {
      "hb": -4.3,
      "ivb": -1.5
     },
     {
      "hb": -6.0,
      "ivb": -0.6
     },
     {
      "hb": -7.5,
      "ivb": 0.3
     },
     {
      "hb": -5.7,
      "ivb": 2.6
     },
     {
      "hb": -10.9,
      "ivb": -0.8
     },
     {
      "hb": -7.0,
      "ivb": -0.4
     },
     {
      "hb": -4.8,
      "ivb": 0.9
     },
     {
      "hb": -5.5,
      "ivb": -0.5
     },
     {
      "hb": -4.7,
      "ivb": 0.9
     },
     {
      "hb": -8.4,
      "ivb": -0.1
     },
     {
      "hb": -7.7,
      "ivb": -1.6
     },
     {
      "hb": -5.3,
      "ivb": 0.4
     },
     {
      "hb": -5.3,
      "ivb": -1.1
     },
     {
      "hb": -5.8,
      "ivb": -1.2
     },
     {
      "hb": -4.9,
      "ivb": 1.4
     },
     {
      "hb": -2.7,
      "ivb": 2.3
     },
     {
      "hb": -6.8,
      "ivb": -0.4
     },
     {
      "hb": -7.0,
      "ivb": 0.8
     },
     {
      "hb": -2.3,
      "ivb": 1.4
     },
     {
      "hb": -9.0,
      "ivb": -1.7
     },
     {
      "hb": -7.6,
      "ivb": 1.1
     },
     {
      "hb": -5.5,
      "ivb": 0.8
     },
     {
      "hb": -2.6,
      "ivb": -1.0
     },
     {
      "hb": -6.9,
      "ivb": 3.4
     },
     {
      "hb": -5.0,
      "ivb": -0.9
     },
     {
      "hb": -8.7,
      "ivb": -2.1
     },
     {
      "hb": -9.4,
      "ivb": 0.4
     },
     {
      "hb": -5.4,
      "ivb": 1.9
     }
    ]
   }
  },
  "outcomes": {
   "SI": {
    "n": 110,
    "take": 60,
    "swing": 50,
    "calledStrike": 17,
    "ball": 43,
    "hbp": 0,
    "whiff": 9,
    "foul": 19,
    "inPlay": 22,
    "pop": 1,
    "weakGb": 6,
    "hardGb": 5,
    "line": 5,
    "weakFb": 3,
    "hardFb": 2,
    "unclassified": 0
   },
   "SL": {
    "n": 79,
    "take": 38,
    "swing": 41,
    "calledStrike": 11,
    "ball": 27,
    "hbp": 0,
    "whiff": 16,
    "foul": 13,
    "inPlay": 12,
    "pop": 1,
    "weakGb": 3,
    "hardGb": 3,
    "line": 3,
    "weakFb": 1,
    "hardFb": 1,
    "unclassified": 0
   }
  },
  "league": {
   "FF": {
    "ivb": 17.0,
    "hb": 7.0,
    "rpm": 2400
   },
   "SI": {
    "ivb": 9.0,
    "hb": 15.5,
    "rpm": 2200
   },
   "FC": {
    "ivb": 10.0,
    "hb": -2.0,
    "rpm": 2350
   },
   "SL": {
    "ivb": 1.5,
    "hb": -5.0,
    "rpm": 2450
   },
   "ST": {
    "ivb": 1.0,
    "hb": -16.0,
    "rpm": 2550
   },
   "CU": {
    "ivb": -9.5,
    "hb": -7.0,
    "rpm": 2600
   },
   "CH": {
    "ivb": 6.0,
    "hb": 15.0,
    "rpm": 1800
   },
   "FS": {
    "ivb": 4.0,
    "hb": 12.5,
    "rpm": 1400
   }
  }
 }
} as unknown as Record<string, StuffDetail>
