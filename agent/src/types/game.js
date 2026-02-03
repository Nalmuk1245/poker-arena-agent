"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerAction = exports.GamePhase = void 0;
var GamePhase;
(function (GamePhase) {
    GamePhase["WAITING"] = "WAITING";
    GamePhase["PREFLOP"] = "PREFLOP";
    GamePhase["FLOP"] = "FLOP";
    GamePhase["TURN"] = "TURN";
    GamePhase["RIVER"] = "RIVER";
    GamePhase["SHOWDOWN"] = "SHOWDOWN";
    GamePhase["COMPLETE"] = "COMPLETE";
})(GamePhase || (exports.GamePhase = GamePhase = {}));
var PlayerAction;
(function (PlayerAction) {
    PlayerAction["FOLD"] = "FOLD";
    PlayerAction["CHECK"] = "CHECK";
    PlayerAction["CALL"] = "CALL";
    PlayerAction["RAISE"] = "RAISE";
    PlayerAction["ALL_IN"] = "ALL_IN";
})(PlayerAction || (exports.PlayerAction = PlayerAction = {}));
