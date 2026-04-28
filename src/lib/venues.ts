// MLB stadium coordinates for weather lookups
// Indoor stadiums marked — we skip weather for those

export type VenueInfo = {
  lat: number
  lon: number
  indoor: boolean
  city: string
}

export const MLB_VENUES: Record<string, VenueInfo> = {
  // AL East
  "Yankee Stadium": { lat: 40.8296, lon: -73.9262, indoor: false, city: "Bronx, NY" },
  "Fenway Park": { lat: 42.3467, lon: -71.0972, indoor: false, city: "Boston, MA" },
  "Tropicana Field": { lat: 27.7682, lon: -82.6534, indoor: true, city: "St. Petersburg, FL" },
  "Steinbrenner Field": { lat: 27.9799, lon: -82.5066, indoor: false, city: "Tampa, FL" },
  "Rogers Centre": { lat: 43.6414, lon: -79.3894, indoor: true, city: "Toronto, ON" },
  "Oriole Park at Camden Yards": { lat: 39.2840, lon: -76.6217, indoor: false, city: "Baltimore, MD" },

  // AL Central
  "Progressive Field": { lat: 41.4962, lon: -81.6852, indoor: false, city: "Cleveland, OH" },
  "Comerica Park": { lat: 42.3390, lon: -83.0485, indoor: false, city: "Detroit, MI" },
  "Kauffman Stadium": { lat: 39.0517, lon: -94.4803, indoor: false, city: "Kansas City, MO" },
  "Target Field": { lat: 44.9817, lon: -93.2776, indoor: false, city: "Minneapolis, MN" },
  "Guaranteed Rate Field": { lat: 41.8300, lon: -87.6338, indoor: false, city: "Chicago, IL" },
  "Rate Field": { lat: 41.8300, lon: -87.6338, indoor: false, city: "Chicago, IL" },

  // AL West
  "Minute Maid Park": { lat: 29.7572, lon: -95.3553, indoor: true, city: "Houston, TX" },
  "Daikin Park": { lat: 29.7572, lon: -95.3553, indoor: true, city: "Houston, TX" },
  "Angel Stadium": { lat: 33.8003, lon: -117.8827, indoor: false, city: "Anaheim, CA" },
  "Oakland Coliseum": { lat: 37.7516, lon: -122.2008, indoor: false, city: "Oakland, CA" },
  "Sutter Health Park": { lat: 38.5805, lon: -121.5132, indoor: false, city: "Sacramento, CA" },
  "T-Mobile Park": { lat: 47.5914, lon: -122.3325, indoor: false, city: "Seattle, WA" },
  "Globe Life Field": { lat: 32.7473, lon: -97.0844, indoor: true, city: "Arlington, TX" },

  // NL East
  "Truist Park": { lat: 33.8908, lon: -84.4678, indoor: false, city: "Atlanta, GA" },
  "loanDepot park": { lat: 25.7781, lon: -80.2197, indoor: true, city: "Miami, FL" },
  "Citi Field": { lat: 40.7571, lon: -73.8458, indoor: false, city: "New York, NY" },
  "Citizens Bank Park": { lat: 39.9061, lon: -75.1665, indoor: false, city: "Philadelphia, PA" },
  "Nationals Park": { lat: 38.8730, lon: -77.0074, indoor: false, city: "Washington, DC" },

  // NL Central
  "Wrigley Field": { lat: 41.9484, lon: -87.6553, indoor: false, city: "Chicago, IL" },
  "Great American Ball Park": { lat: 39.0975, lon: -84.5070, indoor: false, city: "Cincinnati, OH" },
  "American Family Field": { lat: 43.0280, lon: -87.9712, indoor: true, city: "Milwaukee, WI" },
  "PNC Park": { lat: 40.4469, lon: -80.0057, indoor: false, city: "Pittsburgh, PA" },
  "Busch Stadium": { lat: 38.6226, lon: -90.1928, indoor: false, city: "St. Louis, MO" },

  // NL West
  "Chase Field": { lat: 33.4453, lon: -112.0667, indoor: true, city: "Phoenix, AZ" },
  "Coors Field": { lat: 39.7559, lon: -104.9942, indoor: false, city: "Denver, CO" },
  "Dodger Stadium": { lat: 34.0739, lon: -118.2400, indoor: false, city: "Los Angeles, CA" },
  "Petco Park": { lat: 32.7073, lon: -117.1566, indoor: false, city: "San Diego, CA" },
  "Oracle Park": { lat: 37.7786, lon: -122.3893, indoor: false, city: "San Francisco, CA" },
}

export function getVenueInfo(venueName: string | undefined): VenueInfo | null {
  if (!venueName) return null
  return MLB_VENUES[venueName] ?? null
}

// Stadium orientation — which compass direction does the field point?
// Used to translate raw wind direction into "blowing in/out/across"
// (For each stadium, "homeplate_to_cf_bearing" is the compass bearing
//  from home plate to center field — wind from this direction is "blowing in")
export const STADIUM_ORIENTATION: Record<string, number> = {
  "Yankee Stadium": 75,        // CF roughly to ENE
  "Fenway Park": 45,           // CF to NE
  "Dodger Stadium": 65,
  "Wrigley Field": 30,         // famous "winds blowing out to LF" days
  "Coors Field": 0,            // CF straight north
  "Citi Field": 60,
  "Citizens Bank Park": 60,
  "Truist Park": 60,
  "Oracle Park": 90,           // CF to east, marine layer from west
  "Petco Park": 60,
  "Great American Ball Park": 30,
  "PNC Park": 90,
  "Busch Stadium": 60,
  "Kauffman Stadium": 0,
  "Target Field": 0,
  "Comerica Park": 30,
  "Progressive Field": 0,
  "Guaranteed Rate Field": 30,
  "Rate Field": 30,
  "Camden Yards": 60,
  "Oriole Park at Camden Yards": 60,
  "Steinbrenner Field": 60,
  "Sutter Health Park": 30,
  "Oakland Coliseum": 60,
  "Angel Stadium": 30,
  "T-Mobile Park": 0,
  "Nationals Park": 60,
}

// Returns a short baseball-relevant description of wind impact
export function describeWindImpact(
  venueName: string,
  windFromDirection: number,
  windMph: number
): string | null {
  if (windMph < 5) return null  // negligible

  const cfBearing = STADIUM_ORIENTATION[venueName]
  if (cfBearing === undefined) return null

  // Wind direction is "from", so wind goes TO (cfBearing + 180)
  const windToDir = (windFromDirection + 180) % 360

  // Difference between where wind is going and where CF is
  let diff = Math.abs(windToDir - cfBearing)
  if (diff > 180) diff = 360 - diff

  if (diff <= 30) return `Blowing out to center — favors hitters`
  if (diff <= 60) {
    // figure out left or right
    const isLeft = ((windToDir - cfBearing + 360) % 360) > 180
    return `Blowing out to ${isLeft ? 'left' : 'right'} field`
  }
  if (diff >= 150) return `Blowing in from center — suppresses scoring`
  if (diff >= 120) {
    const isLeft = ((windToDir - cfBearing + 360) % 360) > 180
    return `Blowing in from ${isLeft ? 'left' : 'right'} field`
  }
  return `Crosswind across the diamond`
}