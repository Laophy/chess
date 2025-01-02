const WebSocket = require("ws");
const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 3001;

// Serve static files from the React build
app.use(express.static(path.join(__dirname, "../../build")));

// Handle React routing, return all requests to React app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../build", "index.html"));
});

let server;
if (process.env.NODE_ENV === "production") {
  // In production, the app will be behind a proxy that handles SSL
  server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
} else {
  // In development, use regular HTTP
  server = app.listen(port, () => {
    console.log(`Development server running on port ${port}`);
  });
}

// Create WebSocket server attached to the HTTP/HTTPS server
const wss = new WebSocket.Server({ server });

console.log(`WebSocket server initialized on port ${port}`);

// Log total connections
setInterval(() => {
  console.log(`Active WebSocket connections: ${wss.clients.size}`);
}, 5000);

// Keep all your existing game logic here - DO NOT MODIFY IT
wss.on("connection", (ws) => {
  console.log(
    `New WebSocket connection established. Total connections: ${wss.clients.size}`
  );
  let currentRoom = null;
  let playerColor = null;

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log("Received message:", data.type, data);

      switch (data.type) {
        case "CREATE_ROOM":
          if (rooms.has(data.roomName)) {
            ws.send(
              JSON.stringify({ type: "ERROR", message: "Room already exists" })
            );
            return;
          }
          // Debug log before random assignment
          console.log("Creating new room, determining creator's color...");

          // Randomly decide if creator is white or black
          const randomValue = Math.random();
          const creatorIsWhite = randomValue < 0.5;
          playerColor = creatorIsWhite ? "white" : "black";

          // Debug log after assignment
          console.log(`Random value: ${randomValue}`);
          console.log(`Creator will play as: ${playerColor}`);

          rooms.set(data.roomName, {
            players: [{ ws, name: data.playerName, color: playerColor }],
            spectators: [],
            gameState: {
              board: initializeBoard(),
              currentPlayer: "white", // Game always starts with white
              capturedPieces: { white: [], black: [] },
              scores: {
                white: 0,
                black: 0,
              },
              gameStatus: "active",
              gameStartTime: null,
            },
          });
          currentRoom = data.roomName;

          // Debug log room state
          console.log("Room created with state:", {
            roomName: data.roomName,
            creatorName: data.playerName,
            creatorColor: playerColor,
          });

          ws.send(
            JSON.stringify({
              type: "ROOM_CREATED",
              roomName: data.roomName,
              color: playerColor,
            })
          );
          broadcastRoomList();
          break;

        case "JOIN_ROOM":
          const room = rooms.get(data.roomName);
          if (!room) {
            ws.send(
              JSON.stringify({ type: "ERROR", message: "Room not found" })
            );
            return;
          }
          if (room.players.length >= 2) {
            ws.send(JSON.stringify({ type: "ERROR", message: "Room is full" }));
            return;
          }
          // Second player gets opposite color of first player
          playerColor = room.players[0].color === "white" ? "black" : "white";
          room.players.push({ ws, name: data.playerName, color: playerColor });
          currentRoom = data.roomName;

          // Notify both players that game can start
          room.players.forEach((player) => {
            player.ws.send(
              JSON.stringify({
                type: "GAME_START",
                players: room.players.map((p) => p.name),
                color: player.color,
                playerName: player.name,
                firstMove: player.color === "white",
              })
            );
          });
          broadcastRoomList();
          break;

        case "SPECTATE_ROOM":
          console.log("Spectate request received for room:", data.roomName);
          const spectateRoom = rooms.get(data.roomName);
          console.log(
            "Available rooms:",
            Array.from(rooms.entries()).map(([name, room]) => ({
              name,
              players: room.players.length,
              spectators: room.spectators.length,
              hasGameState: !!room.gameState,
            }))
          );

          if (!spectateRoom) {
            console.log("Room not found:", data.roomName);
            ws.send(
              JSON.stringify({ type: "ERROR", message: "Room not found" })
            );
            return;
          }

          console.log("Found room:", {
            name: data.roomName,
            players: spectateRoom.players.map((p) => p.name),
            numSpectators: spectateRoom.spectators.length,
            hasBoard: !!spectateRoom.gameState?.board,
            currentPlayer: spectateRoom.gameState?.currentPlayer,
          });

          // Only allow spectating if there are 2 players
          if (spectateRoom.players.length !== 2) {
            console.log(
              "Room not ready for spectating:",
              spectateRoom.players.length,
              "players"
            );
            ws.send(
              JSON.stringify({
                type: "ERROR",
                message: "Game hasn't started yet",
              })
            );
            return;
          }

          // Verify the game state is valid
          if (!spectateRoom.gameState?.board) {
            console.error("Invalid game state:", spectateRoom.gameState);
            ws.send(
              JSON.stringify({
                type: "ERROR",
                message: "Game state error",
              })
            );
            return;
          }

          // Remove spectator if they were already spectating somewhere
          if (currentRoom) {
            const oldRoom = rooms.get(currentRoom);
            if (oldRoom) {
              oldRoom.spectators = oldRoom.spectators.filter(
                (s) => s.ws !== ws
              );
              // Notify everyone in the old room about spectator leaving
              broadcastToRoom(currentRoom, {
                type: "SPECTATOR_UPDATE",
                count: oldRoom.spectators.length || 0,
              });
            }
          }

          spectateRoom.spectators.push({ ws, name: data.playerName });
          currentRoom = data.roomName;

          // Notify everyone in the room about new spectator
          broadcastToRoom(currentRoom, {
            type: "SPECTATOR_UPDATE",
            count: spectateRoom.spectators.length,
            action: "join",
            spectator: data.playerName,
          });

          // Create a deep copy of the game state to avoid reference issues
          const gameStateCopy = {
            board: JSON.parse(JSON.stringify(spectateRoom.gameState.board)),
            currentPlayer: spectateRoom.gameState.currentPlayer,
            capturedPieces: JSON.parse(
              JSON.stringify(spectateRoom.gameState.capturedPieces)
            ),
            scores: spectateRoom.gameState.scores || { white: 0, black: 0 },
            gameStatus: spectateRoom.gameState.gameStatus || "active",
            gameStartTime: spectateRoom.gameState.gameStartTime,
          };

          // Get player names with their colors
          const playerInfo = spectateRoom.players.map((p) => ({
            name: p.name,
            color: p.color,
          }));

          const spectatorGameState = {
            type: "GAME_STATE",
            gameState: gameStateCopy,
            players: playerInfo,
            roomName: currentRoom,
          };

          console.log("Attempting to send game state to spectator");
          try {
            ws.send(JSON.stringify(spectatorGameState));
            console.log("Game state sent successfully to spectator");

            // Notify everyone in the room about new spectator count
            broadcastToRoom(currentRoom, {
              type: "SPECTATOR_UPDATE",
              count: spectateRoom.spectators.length,
            });
            broadcastRoomList();
            console.log("Room updates broadcasted");
          } catch (error) {
            console.error("Error in spectate process:", error);
          }
          break;

        case "MOVE":
          const gameRoom = rooms.get(currentRoom);
          if (gameRoom) {
            // Set game start time on first move
            if (!gameRoom.gameState.gameStartTime) {
              gameRoom.gameState.gameStartTime = Date.now();
              // Broadcast the initial game start time to all players and spectators
              [...gameRoom.players, ...gameRoom.spectators].forEach(
                (participant) => {
                  if (participant.ws !== ws) {
                    // Don't send to the moving player
                    participant.ws.send(
                      JSON.stringify({
                        type: "GAME_START_TIME",
                        gameStartTime: gameRoom.gameState.gameStartTime,
                      })
                    );
                  }
                }
              );
            }

            // Deep copy the new game state to avoid reference issues
            const newGameState = {
              board: JSON.parse(JSON.stringify(data.gameState.board)),
              currentPlayer: data.gameState.currentPlayer,
              capturedPieces: JSON.parse(
                JSON.stringify(data.gameState.capturedPieces)
              ),
              gameStatus: data.gameState.gameStatus || "active",
              gameStartTime: gameRoom.gameState.gameStartTime, // Include the start time
            };

            gameRoom.gameState = newGameState;

            // Broadcast move to players and spectators
            [...gameRoom.players, ...gameRoom.spectators].forEach(
              (participant) => {
                if (participant.ws !== ws) {
                  const moveUpdate = {
                    type: "OPPONENT_MOVE",
                    gameState: JSON.parse(JSON.stringify(newGameState)),
                    move: data.move,
                  };
                  participant.ws.send(JSON.stringify(moveUpdate));
                }
              }
            );

            // Calculate scores based on captured pieces
            const calculateScore = (pieces) => {
              const pieceValues = {
                "♟": 1,
                "♙": 1, // pawns
                "♜": 5,
                "♖": 5, // rooks
                "♞": 3,
                "♘": 3, // knights
                "♝": 3,
                "♗": 3, // bishops
                "♛": 9,
                "♕": 9, // queens
              };
              return pieces.reduce(
                (total, piece) => total + (pieceValues[piece] || 0),
                0
              );
            };

            // Update scores in game state
            gameRoom.gameState.scores = {
              white: calculateScore(gameRoom.gameState.capturedPieces.white),
              black: calculateScore(gameRoom.gameState.capturedPieces.black),
            };

            // Debug log current state
            console.log("Move processed. Current game state:", {
              currentPlayer: gameRoom.gameState.currentPlayer,
              moveFrom: data.move.from,
              moveTo: data.move.to,
            });

            // Update room list to reflect any score changes
            broadcastRoomList();
          }
          break;

        case "FORFEIT":
          const forfeitRoom = rooms.get(currentRoom);
          if (forfeitRoom) {
            forfeitRoom.players.forEach((player) => {
              player.ws.send(
                JSON.stringify({
                  type: "GAME_OVER",
                  winner: player.ws === ws ? "opponent" : "you",
                  reason: "forfeit",
                })
              );
            });
            rooms.delete(currentRoom);
            broadcastRoomList();
          }
          break;

        case "GET_ROOMS":
          ws.send(
            JSON.stringify({
              type: "ROOM_LIST",
              rooms: Array.from(rooms.keys()).map((roomName) => {
                const room = rooms.get(roomName);
                return {
                  name: roomName,
                  players: room.players.length,
                  spectators: room.spectators.length,
                  scores: room.gameState?.scores || { white: 0, black: 0 },
                  capturedPieces: room.gameState?.capturedPieces || {
                    white: [],
                    black: [],
                  },
                  inProgress: room.players.length === 2,
                };
              }),
            })
          );
          break;

        case "LEAVE_ROOM":
          if (currentRoom) {
            const room = rooms.get(currentRoom);
            if (room) {
              // If there's only one player, delete the room
              if (room.players.length === 1) {
                console.log(`Player left waiting room: ${currentRoom}`);
                rooms.delete(currentRoom);
              } else {
                // Remove the player from the room
                room.players = room.players.filter(
                  (player) => player.ws !== ws
                );
              }
              currentRoom = null;
              playerColor = null;
              broadcastRoomList();
            }
          }
          break;

        default:
          console.warn("Unknown message type received:", data.type);
          ws.send(
            JSON.stringify({
              type: "ERROR",
              message: "Unknown message type",
            })
          );
          break;
      }
    } catch (error) {
      console.error("Error processing message:", error);
      ws.send(
        JSON.stringify({
          type: "ERROR",
          message: "Internal server error",
        })
      );
    }
  });

  ws.on("close", () => {
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        // Check if the disconnected client was a player or spectator
        const isPlayer = room.players.some((player) => player.ws === ws);

        if (isPlayer) {
          // If there's only one player (the one leaving), just delete the room
          if (room.players.length === 1) {
            console.log(`Deleting empty room: ${currentRoom}`);
            rooms.delete(currentRoom);
            broadcastRoomList();
            return;
          }

          // Notify other player about disconnection
          room.players.forEach((player) => {
            if (player.ws !== ws) {
              player.ws.send(
                JSON.stringify({
                  type: "GAME_OVER",
                  winner: "you",
                  reason: "disconnect",
                })
              );
            }
          });
          rooms.delete(currentRoom);
          broadcastRoomList();
        } else {
          // Find the spectator's name before removing them
          const leavingSpectator = room.spectators.find(
            (s) => s.ws === ws
          )?.name;

          // First remove the spectator from the room
          room.spectators = room.spectators.filter((s) => s.ws !== ws);

          // Then broadcast the update to everyone in the room
          broadcastToRoom(currentRoom, {
            type: "SPECTATOR_UPDATE",
            count: room.spectators.length,
            action: "leave",
            spectator: leavingSpectator,
          });

          // Finally broadcast the updated room list to all clients
          broadcastRoomList();
        }
      }
    }
  });

  function broadcastToRoom(roomName, message) {
    const room = rooms.get(roomName);
    if (room) {
      [...room.players, ...room.spectators].forEach((participant) => {
        if (participant.ws.readyState === WebSocket.OPEN) {
          participant.ws.send(JSON.stringify(message));
        }
      });
    }
  }
});

// Initialize chess board
function initializeBoard() {
  const initialBoard = Array(8)
    .fill(null)
    .map(() => Array(8).fill(null));
  // Set pawns
  for (let i = 0; i < 8; i++) {
    initialBoard[1][i] = { piece: "♟", color: "black" };
    initialBoard[6][i] = { piece: "♙", color: "white" };
  }
  // Set other pieces
  const backRankPieces = ["♜", "♞", "♝", "♛", "♚", "♝", "♞", "♜"];
  const frontRankPieces = ["♖", "♘", "♗", "♕", "♔", "♗", "♘", "♖"];
  for (let i = 0; i < 8; i++) {
    initialBoard[0][i] = { piece: backRankPieces[i], color: "black" };
    initialBoard[7][i] = { piece: frontRankPieces[i], color: "white" };
  }
  return initialBoard;
}

// Function to broadcast room list to all clients
function broadcastRoomList() {
  // Clean up any rooms with no players
  for (const [roomName, room] of rooms.entries()) {
    if (room.players.length === 0) {
      rooms.delete(roomName);
    }
  }

  const roomList = Array.from(rooms.keys()).map((roomName) => {
    const room = rooms.get(roomName);
    const currentTime = Date.now();
    return {
      name: roomName,
      players: room.players.length,
      spectators: room.spectators.length || 0,
      scores: room.gameState?.scores || { white: 0, black: 0 },
      capturedPieces: room.gameState?.capturedPieces || {
        white: [],
        black: [],
      },
      inProgress: room.players.length === 2,
      gameStartTime: room.gameState?.gameStartTime || null,
      timestamp: currentTime,
    };
  });

  // Broadcast to all connected clients
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(
          JSON.stringify({
            type: "ROOM_LIST",
            rooms: roomList,
            timestamp: Date.now(),
          })
        );
      } catch (error) {
        console.error("Error broadcasting room list to client:", error);
      }
    }
  });
}

// WebSocket server logging
wss.on("listening", () => {
  console.log("WebSocket server is listening");

  // Set up periodic room list broadcast
  setInterval(() => {
    broadcastRoomList();
  }, 1000); // Update every second
});

wss.on("error", (error) => {
  console.error("WebSocket server error:", error);
});

// Store active rooms
const rooms = new Map();

// Test random color distribution
let whiteCount = 0;
let blackCount = 0;
for (let i = 0; i < 1000; i++) {
  if (Math.random() < 0.5) whiteCount++;
  else blackCount++;
}
console.log(`Random color distribution test:
  White: ${whiteCount}
  Black: ${blackCount}
 `);
