import { ClashBot } from "./bot/clashBot.js";
import { SteamHandler } from "./bot/steamHandler.js";

const steamHandler = new SteamHandler();
new ClashBot(steamHandler);