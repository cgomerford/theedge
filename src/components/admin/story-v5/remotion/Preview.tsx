// src/components/admin/story-v5/remotion/Preview.tsx
//
// The composition: 30 fps, 1080x1350, as long as the ticked slides (up to 45 s). Scene lengths live in config.ts. Props are plain data (the PreviewData JSON), so the same
// component runs in the admin Remotion Player and in the @remotion/renderer job.

import { Sequence } from 'remotion'
import { DEFAULT_SCENES, THEMES, layout, type SceneId } from './config'
import { ArsenalScene, TunnelScene } from './scenes/arsenal'
import { BullpenScene, DefenseScene, OutroScene, type BullpenMode, type DefenseMode } from './scenes/defense'
import { EMPTY_CUSTOM, type CustomSlide } from './custom'
import { CompareScene, ScoutScene, type ScoutTopic } from './scenes/extra'
import { CustomScene } from './scenes/custom'
import { HookScene } from './scenes/hook'
import { ReplayScene } from './scenes/replay'
import { DEFAULT_LOOK, type Look, type SlideOptions } from './options'
import type { Titles } from './titles'
import { MatchupScene } from './scenes/matchup'
import { Frame, OptionsProvider, ThemeProvider, TitlesProvider } from './ui'
import type { PreviewData } from '../types'

export type PreviewProps = { data: PreviewData; scenes?: SceneId[]; theme?: 'paper' | 'dark'; defenseMode?: DefenseMode; bullpenMode?: BullpenMode; scoutTopic?: ScoutTopic; custom?: CustomSlide[]; titles?: Titles; options?: SlideOptions; look?: Look }

export function Preview({ data, scenes = DEFAULT_SCENES, theme = 'paper', defenseMode = 'home', bullpenMode = 'lastGame', scoutTopic = 'run', custom = [], titles, options, look = DEFAULT_LOOK }: PreviewProps) {
  return (
    <ThemeProvider value={THEMES[theme]}>
      <TitlesProvider value={titles}>
      <OptionsProvider value={options}>
      <Frame footerLeft={data.series.footer} teams={data.teams} look={look}>
        {layout(scenes).scenes.map(s => (
          <Sequence key={`${s.id}${s.from}`} from={s.from} durationInFrames={s.length}>
            {s.id === 'hook' ? <HookScene data={data} />
              : s.id === 'matchup' ? <MatchupScene data={data} />
              : s.id === 'replay' ? <ReplayScene data={data} />
              : s.id === 'arsenal' ? <ArsenalScene data={data} side="away" />
              : s.id === 'arsenalHome' ? <ArsenalScene data={data} side="home" />
              : s.id === 'compare' ? <CompareScene data={data} />
              : s.id === 'tunnel' ? <TunnelScene data={data} />
              : s.id === 'defense' ? <DefenseScene data={data} mode={defenseMode} />
              : s.id === 'defenseAway' ? <DefenseScene data={data} mode="away" id="defenseAway" />
              : s.id === 'scout' ? <ScoutScene data={data} topic={scoutTopic} />
              : s.id === 'custom' ? <CustomScene c={custom[0] ?? EMPTY_CUSTOM} data={data} />
              : s.id === 'custom2' ? <CustomScene c={custom[1] ?? EMPTY_CUSTOM} data={data} />
              : s.id === 'bullpen' ? <BullpenScene data={data} mode={bullpenMode} />
              : <OutroScene data={data} />}
          </Sequence>
        ))}
      </Frame>
      </OptionsProvider>
      </TitlesProvider>
    </ThemeProvider>
  )
}
