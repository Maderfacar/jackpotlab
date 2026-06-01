import { GAMES, GAME_IDS } from '../../../shared/lotto/games'

export default defineEventHandler(() => {
  return {
    games: GAME_IDS.map(id => ({
      id,
      name: GAMES[id].name,
      shortName: GAMES[id].shortName,
      drawSchedule: GAMES[id].drawSchedule,
      cadenceLabel: GAMES[id].cadenceLabel,
      numbersCount: GAMES[id].numbersCount,
      numberMin: GAMES[id].numberMin,
      numberMax: GAMES[id].numberMax,
      hasSpecial: GAMES[id].hasSpecial,
      specialLabel: GAMES[id].specialLabel,
      realtime: GAMES[id].realtime,
      queryMode: GAMES[id].queryMode
    }))
  }
})
