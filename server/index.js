/* server/index.js — wejście Workera. Routuje /parties/game-room/:kod do DO GameRoom. */
import { routePartykitRequest } from 'partyserver';

export { GameRoom } from './gameRoom.js';

export default {
  async fetch(request, env) {
    return (
      (await routePartykitRequest(request, env)) ||
      new Response('stacja-rooms: not found', { status: 404 })
    );
  },
};
