import SteamUser from 'steam-user';
import SteamAuth from 'steam-totp';
import SteamCommunity from 'steamcommunity';
import TradeOfferManager from 'steam-tradeoffer-manager';
import config from './config.json' assert { type: "json" };

/**
 * Steam 2FA secret keys.
 * Shared secret to login into steam.
 * Identity secret to accept confirmations.
 */
const sharedSecret = config.shared_secret;
const identitySecret = config.identity_secret;

/**
 * Steam account username and password.
 */
const username = config.steam_username;
const password = config.steam_password;

/**
 * States of a trade offer.
 */
const OFFER_ACCEPTED_STATE = 3;
const OFFER_CANCELLED_STATE = 6;

export class SteamHandler {
    /**
     * Initializes handlers and steam fields.
     * 
     */
    constructor() {
        this.steamUser = new SteamUser();
        this.steamCommunity = new SteamCommunity();
        this.offerManager = new TradeOfferManager({
            steam: this.steamUser,
            community: this.steamCommunity,
            language: 'en',
            pollInterval: 20000
        });
        this.init();
    }

    /**
     * Logs into steam and accepts any trade offers that do not include any of
     * the user's items.
     */
    async init() {
        /**
         * Sets log in information for steamUser and generates 2FA code using shared secret.
         */
        const logOnOptions = {
            accountName: username,
            password: password,
            // twoFactorCode: SteamAuth.generateAuthCode(`${sharedSecret}`)
        }

        /**
         * Logs into Steam with given logOnOptions.
         */
        this.steamUser.logOn(logOnOptions);

        /**
         * Sets steamUser's steam status.
         */
        this.steamUser.on('loggedOn', () => {
            console.log('Logged into Steam.');
            this.steamUser.setPersona(SteamUser.EPersonaState.Invisible);
        });

        /**
         * Sets cookies for offerManager and steamCommunity. If desired, function also
         * confirms trade offers every 10 seconds using the identitySecret.
         */
        this.steamUser.on('webSession', (sessionID, cookies) => {
            this.offerManager.setCookies(cookies);
            this.steamCommunity.setCookies(cookies);
            // this.steamCommunity.startConfirmationChecker(10000, `${identitySecret}`);
        });

        // Listeners
        this.autoAcceptOffers();
        this.trackSentOffers();
    }

    /**
     * Accepts any incoming offer where user gives no items.
     */
    autoAcceptOffers() {
        this.offerManager.on('newOffer', (offer) => {
            if (offer.itemsToGive.length === 0) {
                offer.accept((error) => {
                    if (error) {
                        console.error('Error accepting new offer:', error);
                    } else {
                        offer.getReceivedItems(async (error, items) => {
                            if (error) {
                                console.error('Error recieving accepted offer items:', error);
                            } else {
                                for (const item of items) {
                                    console.log(`\x1b[35mTrade offer accepted. Item: ${item.market_hash_name}.\x1b[37m`);
                                }
                            }
                        });
                    }
                });
            }
        });
    }

    /**
     * Keeps track of sent trade offer states.
     */
    trackSentOffers() {
        this.offerManager.on('sentOfferChanged', (offer, oldState) => {
            const data = offer.data("transactionData");
            if (offer.state === OFFER_ACCEPTED_STATE) {
                console.log(`\x1b[32mBuyer accepted the trade offer containing ${data.item_name}.\x1b[37m`);
            } else if (offer.state === OFFER_CANCELLED_STATE) {
                console.log(`\x1b[31mTrade offer containing ${data.item_name} was cancelled. Buyer took too long to accept.\x1b[37m`);
            }
        });
    }

    /**
     * Sends a trade offer to a buyer and cancels offer if buyer takes
     * too long to accept.
     * 
     * @param {string} buyerTradelink - Buyer's tradelink.
     * @param {number} assetId - Unique item identifier.
     * @param {string} source - Source (website) of send trade offer request.
     * @param {Object} transactionData - Data about the item sale which includes the sell
     * price, sell date, and sell platform.
     */
    async sendTradeOffer(buyerTradelink, assetId, source, transactionData) {
        this.offerManager.getInventoryContents(730, 2, true, (error, inventory) => {
            if (error) {
                console.log(error);
                return;
            } else {
                const offer = this.offerManager.createOffer(buyerTradelink);

                /**
                 * Finds item in steam inventory and adds it to the trade offer.
                 * Sets the itemName variable for logging.
                 */
                let itemName = "";
                inventory.forEach((item) => {
                    if (assetId == item.assetid) {
                        offer.addMyItem(inventory[item.pos - 1]);
                        itemName = item.market_hash_name;
                    }
                });

                /**
                 * Attaches sale data and cancelTime to the trade offer.
                 * - Sale data is used when the offer is accepted.
                 * - cancelTime specifies how long the offer remains open before cancellation.
                 */
                offer.data("cancelTime", this.getCancelTime(source));
                offer.data("transactionData", transactionData);

                /**
                 * Sends the trade offer.
                 */
                offer.send((error) => {
                    if (error) {
                        console.log(error);
                    } else {
                        console.log(`\x1b[32mTrade offer containing ${itemName} sent.\x1b[37m`);
                    }
                });
            }
        });
    }

    /**
     * Returns the maximum duration to wait before cancelling the offer.
     * The timeout durations are as follows:
     * - Empire: 12 hours
     * - Clash: 10 minutes
     * - Any other source: 1 hour
     *
     * @param {string} source - The origin of the trade offer (e.g., "empire", "clash").
     * @returns {number} - The maximum wait time in milliseconds for the given source.
     */
    getCancelTime(source) {
        if (source === "empire") {
            return 12 * 60 * 60 * 1000;  // 12 hours in ms
        } else if (source === "clash") {
            return 10 * 60 * 1000;      // 10 minutes in ms
        } else {
            return 1 * 60 * 60 * 1000;  // 1 hour in ms
        }
    }
}