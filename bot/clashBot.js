import axios from 'axios';
import { SteamHandler } from './steamHandler.js';
import { RefreshClashCookies } from './refreshClashCookies.js';
import config from './config.json' assert { type: "json" };

/**
 * Your account's steam ID
 */
const steamId = config.steam_id;

/**
 * Your browser's user agent.
 */

const userAgent = config.browser_user_agent;

/**
 * The time to wait between checks for sold items in SECONDS.
 */
const CHECK_DEPOSITS_INTERVAL = 20;

/**
 * The time to wait between cookie updates in HOURS.
 */
const UPDATE_COOKIE_INTERVAL = 4;

/**
 * The time to wait between accessToken updates in MINUTES.
 */
const UPDATE_ACCESS_TOKEN_INTERVAL = 25;

/**
 * Tracks sent offers to prevent sending multiple offers for the same
 * sold item.
 */
const trackSentOffers = {};

/**
 * Headers to request information from clash.gg
 */
const commonHeaders = {
    Authority: 'clash.gg',
    Accept: '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type': 'application/json',
    Referer: 'https://clash.gg/',
    'User-Agent': `${userAgent}`
}

/**
 * Sell Bot for Clash.gg.
 * Confirms sales and sends trade offers.
 */
export class ClashBot {
    /**
     * Initializes steamHandler and cookie fields.
     * Starts periodic checks of clash deposits.
     * 
     * @param {SteamHandler} steamHandler
     */
    constructor(steamHandler) {
        this.cookie = "";
        this.accessToken = "";
        this.refreshCookie = new RefreshClashCookies();
        this.steamHandler = steamHandler;
        this.init();
    }

    /**
     * Initializes accessToken and cookie.
     * Starts periodic accessToken updates and deposit checks.
     */
    async init() {
        await this.getCookie();
        await this.getAccessToken();
        await this.checkDeposits();
        this.updateCookie();
        this.updateAccessToken();
        this.periodicCheckDeposits();
    }

    /**
     * Gets active deposits and checks for any sold items.
     * If item is sold, the function answers the sale and sends the trade offer.
     * If the offer was accepted, logs the sale.
     */
    async checkDeposits() {
        const deposits = await this.getActiveDeposits();
        deposits.forEach(async (deposit) => {
            try {
                if (deposit.seller.steamId === steamId) {
                    if (deposit.status === "ASKED") {
                        await this.answerSale(deposit.id);
                    } else if (deposit.status === "ANSWERED" && !(trackSentOffers[deposit.id])) {
                        console.log(`Buyer for ${deposit.item.name} found. Sending trade offer.`);
                        const itemName = deposit.item.name;
                        const assetId = deposit.item.inspect.a;
                        const tradelink = deposit.buyerTradelink;
                        const platform = "clash";

                        /**
                         * Packages sale information to attach it to the trade offer. Used in sentOfferChanged
                         * listener to log the sale.
                         */
                        const transactionData = {
                            item_name: itemName
                        }

                        /**
                         * Sends trade offer with given tradelink, assetId, sell platform, and transaction data.
                         */
                        this.steamHandler.sendTradeOffer(
                            tradelink,
                            assetId,
                            platform,
                            transactionData
                        );

                        /**
                         * Keeps track the trade offers that have already been sent for (answered) sold items.
                         * Tracking prevents sending multiple trade offers for the same item.
                         */
                        trackSentOffers[deposit.id] = true;

                        /**
                         * Stops tracking the deposit ID after a delay to conserve memory.
                         * The delay ensures no async conflicts from recent offer actions.
                         */
                        setTimeout(() => {
                            this.stopTracking(deposit);
                        }, 11 * 60 * 1000);
                    }
                }
            } catch (e) {
                console.log('Error while sending offer:', e);
            }
        });
    }
    
    /**
     * Gets clash active listings.
     * 
     * @returns {Array} - Array of active deposits
     */
    async getActiveDeposits() {
        try {
            return (await axios.get('https://clash.gg/api/steam-p2p/listings/my-active', {
                headers: {
                    ...commonHeaders,
                    Authorization: `Bearer ${this.accessToken}`,
                    Cookie: this.cookie
                }
            })).data;
        } catch (e) {
            console.log("Error while fetching active deposits:", e.code);
            return [];
        }
    }
    
    /**
     * Confirms the sale after buyer makes an initial request to buy an item.
     * 
     * @param {number} itemID 
     */
    async answerSale(itemID) {
        try {
            await axios.patch(`https://clash.gg/api/steam-p2p/listings/${itemID}/answer`, {}, {
                headers: {
                    ...commonHeaders,
                    Authorization: `Bearer ${this.accessToken}`,
                    Cookie: this.cookie
                }
            });
        } catch (e) {
            console.log("Error while answering sale:", e.code);
        }
    }

    /**
     * Removes deposit.id from trackSentOffers
     * 
     * @param {Object} deposit - Clashgg deposit item object
     */
    stopTracking(deposit) {
        delete trackSentOffers[deposit.id];
        console.log(`${deposit.item.name} removed from tracking.`);
    }
    
    /**
     * Updates the accessToken used to request information from clash.gg
     * The accessToken expires in about 30 minutes.
     */
    async getAccessToken() {
        try {
            const response = (await axios.get("https://clash.gg/api/auth/access-token", {
                headers: {
                    ...commonHeaders,
                    cookie: this.cookie
                }
            })).data;
            this.accessToken = response.accessToken;
            console.log('Updated accessToken.');
        } catch (e) {
            console.log("Error while fetching access token:", e.code);
        }
    }

    /**
     * Calls refreshCookie and updates cookie field.
     */
    async getCookie() {
        this.cookie = await this.refreshCookie.refreshCookie();
        console.log("Updated cookie.");
    }

    /**
     * Performs periodic checks on active item listings.
     */
    periodicCheckDeposits() {
        setInterval(() => {
            this.checkDeposits();
        }, CHECK_DEPOSITS_INTERVAL * 1000);
    }

    /**
     * Updates the accessToken periodically. Must be updated about every 30 minutes.
     */
    updateAccessToken() {
        setInterval(async () => {
            await this.getAccessToken();
        }, UPDATE_ACCESS_TOKEN_INTERVAL * 60 * 1000);
    }

    /**
     * Updates the cookie that must be changed every few hours. The cookie must
     * be used as a header to request information from clash.gg
     */
    updateCookie() {
        setInterval(async () => {
            await this.getCookie();
        }, UPDATE_COOKIE_INTERVAL * 60 * 60 * 1000);
    }
}