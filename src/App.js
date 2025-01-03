import React, { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import { motion, AnimatePresence } from "framer-motion";
import moveSound from "./sounds/chess_move.mp3";
import selectSound from "./sounds/bloop.mp3";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import white_castle from "./images/chess/white_castle.png";
import white_knight from "./images/chess/white_knight.png";
import white_bishop from "./images/chess/white_bishop.png";
import white_queen from "./images/chess/white_queen.png";
import white_king from "./images/chess/white_king.png";
import white_pawn from "./images/chess/white_pawn.png";
import black_castle from "./images/chess/black_castle.png";
import black_knight from "./images/chess/black_knight.png";
import black_bishop from "./images/chess/black_bishop.png";
import black_queen from "./images/chess/black_queen.png";
import black_king from "./images/chess/black_king.png";
import black_pawn from "./images/chess/black_pawn.png";

const pieceVariants = {
  initial: { scale: 1 },
  selected: { scale: 1.2, filter: "brightness(1.2)" },
};

const WebSocketState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
};

// Custom toast styles
const toastConfig = {
  position: "top-center",
  autoClose: 3000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  progress: undefined,
  theme: "dark",
};

const pieceImages = {
  "♜": black_castle,
  "♞": black_knight,
  "♝": black_bishop,
  "♛": black_queen,
  "♚": black_king,
  "♟": black_pawn,
  "♖": white_castle,
  "♘": white_knight,
  "♗": white_bishop,
  "♕": white_queen,
  "♔": white_king,
  "♙": white_pawn,
};

const capturedPieceVariants = {
  initial: { opacity: 0, y: -10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      repeat: Infinity,
      repeatType: "reverse",
      repeatDelay: Math.random() * 2,
    },
  },
  hover: {
    y: -2,
    scale: 1.1,
    transition: {
      duration: 0.2,
    },
  },
};

export default function App() {
  const audioRef = useRef(new Audio(moveSound));
  const selectAudioRef = useRef(new Audio(selectSound));
  const [board, setBoard] = useState(initializeBoard());
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState("white");
  const [gameStatus, setGameStatus] = useState("active"); // active, check, checkmate
  const [moveHistory, setMoveHistory] = useState([]);
  const [enPassantTarget, setEnPassantTarget] = useState(null);
  const [castlingRights, setCastlingRights] = useState({
    white: { kingSide: true, queenSide: true },
    black: { kingSide: true, queenSide: true },
  });
  const [capturedPieces, setCapturedPieces] = useState({
    white: [],
    black: [],
  });
  const [isMuted, setIsMuted] = useState(false);
  const [ws, setWs] = useState(null);
  const [gameMode, setGameMode] = useState("lobby"); // 'lobby', 'game'
  const [rooms, setRooms] = useState([]);
  const [playerName, setPlayerName] = useState("");
  const [currentRoom, setCurrentRoom] = useState(null);
  const [playerColor, setPlayerColor] = useState(null);
  const [opponent, setOpponent] = useState(null);
  const [roomName, setRoomName] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [spectatorCount, setSpectatorCount] = useState(0);
  const [isSpectator, setIsSpectator] = useState(false);
  const [gameStartTime, setGameStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [firstMoveMade, setFirstMoveMade] = useState(false);
  const [gamePlayers, setGamePlayers] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [boardTheme, setBoardTheme] = useState("classic"); // classic, midnight, forest
  const settingsRef = useRef(null);
  const [hasSetName, setHasSetName] = useState(false);

  useEffect(() => {
    // Load player name from localStorage on mount
    const savedName = localStorage.getItem("chessPlayerName");
    if (savedName) {
      setPlayerName(savedName);
      setHasSetName(true);
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettings(false);
        setShowThemeMenu(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    let wsConnection = null;
    let reconnectTimeout = null;
    let isConnecting = false;

    // Cleanup function to properly close connection
    const cleanup = () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      if (wsConnection) {
        wsConnection.close();
        wsConnection = null;
      }
      isConnecting = false;
    };

    const connectWebSocket = () => {
      // Don't create a new connection if one exists or if we're in the process of connecting
      if (
        wsConnection?.readyState === WebSocket.OPEN ||
        wsConnection?.readyState === WebSocket.CONNECTING ||
        isConnecting
      ) {
        return;
      }

      isConnecting = true;
      // Clean up any existing connection
      cleanup();

      // Determine if we're running on itch.io
      const isItchBuild =
        window.location.hostname.includes("itch.io") ||
        window.location.hostname.includes("html-classic.itch.zone");

      // Choose WebSocket URL based on environment
      const wsUrl = isItchBuild
        ? "wss://lakecountrygames.com/ws"
        : process.env.NODE_ENV === "development"
        ? process.env.REACT_APP_WS_URL
        : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
            window.location.host
          }/ws`;

      console.log("Attempting to connect to WebSocket at:", wsUrl);

      wsConnection = new WebSocket(wsUrl);
      setWs(wsConnection);

      wsConnection.onopen = () => {
        console.log("WebSocket connection opened successfully");
        setWsConnected(true);
        isConnecting = false;
        wsConnection.send(JSON.stringify({ type: "GET_ROOMS" }));
      };

      wsConnection.onclose = () => {
        console.log("WebSocket connection closed");
        setWsConnected(false);
        isConnecting = false;

        // Only attempt to reconnect if we're not unmounting
        if (!reconnectTimeout) {
          reconnectTimeout = setTimeout(() => {
            console.log("Attempting to reconnect...");
            connectWebSocket();
            reconnectTimeout = null;
          }, 3000);
        }
      };

      wsConnection.onerror = (error) => {
        console.error("WebSocket error occurred:", error);
        setWsConnected(false);
        isConnecting = false;
      };

      wsConnection.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "ROOM_LIST":
            setRooms(data.rooms);
            break;
          case "ROOM_CREATED":
            setCurrentRoom(data.roomName);
            setPlayerColor(data.color);
            setGameMode("waiting");
            break;
          case "GAME_START":
            setGameMode("game");
            setPlayerColor(data.color);
            // Find the opponent's name from the players array
            const opponentName = data.players.find(
              (player) => player !== playerName
            );
            setOpponent(opponentName);
            setBoard(initializeBoard());
            setCurrentPlayer("white");
            setFirstMoveMade(false);
            setGameStartTime(null);
            setElapsedTime(0);
            setGameStatus("active");
            setMoveHistory([]);
            setCapturedPieces({ white: [], black: [] });
            setEnPassantTarget(null);
            setCastlingRights({
              white: { kingSide: true, queenSide: true },
              black: { kingSide: true, queenSide: true },
            });
            if (data.firstMove) {
              toast.info("You play as White - Your turn first!", toastConfig);
            } else {
              toast.info(
                `You play as ${
                  data.color === "black" ? "Black" : "White"
                } - Waiting for opponent's move`,
                toastConfig
              );
            }
            break;
          case "OPPONENT_MOVE":
            handleOpponentMove(data);
            break;
          case "GAME_START_TIME":
            setGameStartTime(data.gameStartTime);
            setFirstMoveMade(true);
            break;
          case "GAME_OVER":
            handleGameOver(data);
            break;
          case "ERROR":
            toast.error(data.message, toastConfig);
            if (data.message === "Game hasn't started yet") {
              setGameMode("lobby");
              setCurrentRoom(null);
              setIsSpectator(false);
            }
            break;
          case "SPECTATOR_UPDATE":
            setSpectatorCount(data.count);
            break;
          case "GAME_STATE":
            try {
              setGameMode("game");
              setIsSpectator(true);
              setCurrentRoom(data.roomName);
              setBoard(data.gameState.board);
              setCurrentPlayer(data.gameState.currentPlayer);
              setCapturedPieces(
                data.gameState.capturedPieces || { white: [], black: [] }
              );
              setGamePlayers(data.players);
              setGameStartTime(data.gameState.gameStartTime);
              setFirstMoveMade(!!data.gameState.gameStartTime);
              if (data.gameState.scores) {
                setCapturedPieces((prev) => ({
                  ...prev,
                  scores: data.gameState.scores,
                }));
              }
              setGameStatus(data.gameState.gameStatus || "active");
            } catch (error) {
              console.error("Error setting game state:", error);
            }
            break;
        }
      };
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      cleanup();
    };
  }, []); // Keep empty dependency array

  // Move playerName input handler outside of WebSocket effect
  const handlePlayerNameChange = (e) => {
    setPlayerName(e.target.value);
  };

  const handleNameSubmit = () => {
    if (playerName.trim()) {
      localStorage.setItem("chessPlayerName", playerName.trim());
      setHasSetName(true);
    }
  };

  const createNewGame = () => {
    const roomName = `${playerName}'s Game`;
    createRoom(roomName);
  };

  useEffect(() => {
    if (isKingInCheck(currentPlayer, board)) {
      if (isCheckmate(currentPlayer, board)) {
        setGameStatus("checkmate");
      } else {
        setGameStatus("check");
      }
    } else {
      setGameStatus("active");
    }
  }, [board, currentPlayer]);

  // Update timer effect
  useEffect(() => {
    let interval;
    if (gameStartTime && gameMode === "game" && firstMoveMade) {
      interval = setInterval(() => {
        // Calculate time based on server's start time
        const elapsed = Math.max(
          0,
          Math.floor((Date.now() - gameStartTime) / 1000)
        );
        setElapsedTime(elapsed);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameStartTime, gameMode, firstMoveMade]);

  // Update the timer display format
  const formatTime = (time) => {
    const minutes = Math.floor(Math.max(0, time) / 60);
    const seconds = Math.max(0, time) % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

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

  function findAttackingPieces(color, boardState) {
    const attackers = [];
    let kingRow, kingCol;

    // Find king position
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = boardState[i][j];
        if (
          piece &&
          piece.color === color &&
          (piece.piece === "♔" || piece.piece === "♚")
        ) {
          kingRow = i;
          kingCol = j;
          break;
        }
      }
    }

    // Find all pieces attacking the king
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = boardState[i][j];
        if (piece && piece.color !== color) {
          if (isValidMove(i, j, kingRow, kingCol, true)) {
            attackers.push({
              row: i,
              col: j,
              piece: piece.piece,
            });
          }
        }
      }
    }

    return { attackers, kingPosition: { row: kingRow, col: kingCol } };
  }

  function isValidMove(
    startRow,
    startCol,
    endRow,
    endCol,
    skipKingCheck = false
  ) {
    const piece = board[startRow][startCol];
    const targetSquare = board[endRow][endCol];

    // First validate basic piece movement rules
    const pieceType = piece.piece;
    let isValidPieceMove;
    switch (pieceType) {
      case "♙":
      case "♟":
        isValidPieceMove = isValidPawnMove(startRow, startCol, endRow, endCol);
        break;
      case "♖":
      case "♜":
        isValidPieceMove = isValidRookMove(startRow, startCol, endRow, endCol);
        break;
      case "♘":
      case "♞":
        isValidPieceMove = isValidKnightMove(
          startRow,
          startCol,
          endRow,
          endCol
        );
        break;
      case "♗":
      case "♝":
        isValidPieceMove = isValidBishopMove(
          startRow,
          startCol,
          endRow,
          endCol
        );
        break;
      case "♕":
      case "♛":
        isValidPieceMove = isValidQueenMove(startRow, startCol, endRow, endCol);
        break;
      case "♔":
      case "♚":
        isValidPieceMove = isValidKingMove(startRow, startCol, endRow, endCol);
        break;
      default:
        return false;
    }

    if (!isValidPieceMove) return false;

    // Then check if move is targeting own piece or a king
    if (targetSquare && targetSquare.color === piece.color) return false;
    if (
      targetSquare &&
      (targetSquare.piece === "♔" || targetSquare.piece === "♚")
    )
      return false;

    // Create temporary board for check validation
    const tempBoard = board.map((row) => [...row]);
    tempBoard[endRow][endCol] = tempBoard[startRow][startCol];
    tempBoard[startRow][startCol] = null;

    // Skip king safety check if requested
    if (skipKingCheck) return true;

    // Check validation
    if (isKingInCheck(piece.color, board)) {
      // If we're in check, verify this move resolves it
      if (isKingInCheck(piece.color, tempBoard)) {
        return false;
      }

      // For non-king pieces during check
      if (piece.piece !== "♔" && piece.piece !== "♚") {
        const { attackers, kingPosition } = findAttackingPieces(
          piece.color,
          board
        );

        if (attackers.length > 1) return false;
        if (attackers.length === 0) return true;

        const attacker = attackers[0];

        // Only allow moves that capture the attacker or block the attack
        return (
          (endRow === attacker.row && endCol === attacker.col) || // Capture
          (attacker.piece !== "♞" &&
            attacker.piece !== "♘" &&
            isPieceBetweenPoints(
              attacker.row,
              attacker.col,
              kingPosition.row,
              kingPosition.col,
              endRow,
              endCol
            ))
        );
      }
    }

    // Verify the move doesn't put/leave own king in check
    return !isKingInCheck(piece.color, tempBoard);
  }

  function isValidPawnMove(startRow, startCol, endRow, endCol) {
    const piece = board[startRow][startCol];
    const targetSquare = board[endRow][endCol];
    const direction = piece.color === "white" ? -1 : 1;
    const startingRow = piece.color === "white" ? 6 : 1;

    // Forward moves - only allowed if target square is empty
    if (startCol === endCol) {
      // Can't move forward to capture
      if (targetSquare) return false;

      // Normal one square forward
      if (endRow === startRow + direction) {
        return true;
      }

      // First move - two squares forward
      if (
        startRow === startingRow &&
        endRow === startRow + 2 * direction &&
        !board[startRow + direction][startCol] // Check if square in between is empty
      ) {
        return true;
      }
      return false;
    }

    // Diagonal captures - must have an enemy piece or be en passant
    if (Math.abs(startCol - endCol) === 1 && endRow === startRow + direction) {
      // Regular capture - must have an enemy piece
      if (targetSquare && targetSquare.color !== piece.color) {
        return true;
      }

      // En passant capture
      if (
        enPassantTarget &&
        endRow === enPassantTarget.row &&
        endCol === enPassantTarget.col
      ) {
        return true;
      }
    }

    return false;
  }

  function isValidRookMove(startRow, startCol, endRow, endCol) {
    if (startRow !== endRow && startCol !== endCol) return false;
    return !isPieceBetween(startRow, startCol, endRow, endCol);
  }

  function isValidKnightMove(startRow, startCol, endRow, endCol) {
    const rowDiff = Math.abs(endRow - startRow);
    const colDiff = Math.abs(endCol - startCol);
    return (rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2);
  }

  function isValidBishopMove(startRow, startCol, endRow, endCol) {
    if (Math.abs(endRow - startRow) !== Math.abs(endCol - startCol))
      return false;
    return !isPieceBetween(startRow, startCol, endRow, endCol);
  }

  function isValidQueenMove(startRow, startCol, endRow, endCol) {
    // Queen can only move like a rook (horizontally/vertically) or bishop (diagonally)
    const isDiagonal =
      Math.abs(endRow - startRow) === Math.abs(endCol - startCol);
    const isStraight = startRow === endRow || startCol === endCol;

    // If the move is neither diagonal nor straight, it's invalid
    if (!isDiagonal && !isStraight) {
      return false;
    }

    // Check if there are any pieces in the way
    return !isPieceBetween(startRow, startCol, endRow, endCol);
  }

  function isValidKingMove(startRow, startCol, endRow, endCol) {
    const rowDiff = Math.abs(endRow - startRow);
    const colDiff = Math.abs(endCol - startCol);

    // Normal king move
    if (rowDiff <= 1 && colDiff <= 1) {
      // Check if the target square is under attack
      const color = board[startRow][startCol].color;
      const tempBoard = board.map((row) => [...row]);
      tempBoard[endRow][endCol] = tempBoard[startRow][startCol];
      tempBoard[startRow][startCol] = null;

      return !isSquareUnderAttack(endRow, endCol, color, tempBoard);
    }

    // Castling
    if (rowDiff === 0 && colDiff === 2) {
      const color = board[startRow][startCol].color;
      const rights = castlingRights[color];

      // King's side castling
      if (endCol === startCol + 2 && rights.kingSide) {
        return canCastle(startRow, startCol, "king");
      }

      // Queen's side castling
      if (endCol === startCol - 2 && rights.queenSide) {
        return canCastle(startRow, startCol, "queen");
      }
    }

    return false;
  }

  function canCastle(row, col, side) {
    const color = board[row][col].color;
    if (isKingInCheck(color, board)) return false;

    const direction = side === "king" ? 1 : -1;
    const endCol = side === "king" ? col + 2 : col - 2;

    // Check if squares between king and rook are empty
    for (let i = col + direction; i !== endCol; i += direction) {
      if (board[row][i] || isSquareUnderAttack(row, i, color)) return false;
    }

    return true;
  }

  function isPieceBetween(startRow, startCol, endRow, endCol) {
    const rowDirection = endRow > startRow ? 1 : endRow < startRow ? -1 : 0;
    const colDirection = endCol > startCol ? 1 : endCol < startCol ? -1 : 0;

    let currentRow = startRow + rowDirection;
    let currentCol = startCol + colDirection;

    while (currentRow !== endRow || currentCol !== endCol) {
      if (board[currentRow][currentCol]) return true;
      currentRow += rowDirection;
      currentCol += colDirection;
    }

    return false;
  }

  function isKingInCheck(color, boardState) {
    // Find king position
    let kingRow, kingCol;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = boardState[i][j];
        if (
          piece &&
          piece.color === color &&
          (piece.piece === "♔" || piece.piece === "♚")
        ) {
          kingRow = i;
          kingCol = j;
          break;
        }
      }
      if (kingRow !== undefined) break; // Exit outer loop if king is found
    }

    // Check for attacks from each direction
    return (
      isUnderAttackFromDirection(
        kingRow,
        kingCol,
        color,
        boardState,
        [0, 1],
        ["♖", "♜", "♕", "♛"]
      ) || // Right
      isUnderAttackFromDirection(
        kingRow,
        kingCol,
        color,
        boardState,
        [0, -1],
        ["♖", "♜", "♕", "♛"]
      ) || // Left
      isUnderAttackFromDirection(
        kingRow,
        kingCol,
        color,
        boardState,
        [1, 0],
        ["♖", "♜", "♕", "♛"]
      ) || // Down
      isUnderAttackFromDirection(
        kingRow,
        kingCol,
        color,
        boardState,
        [-1, 0],
        ["♖", "♜", "♕", "♛"]
      ) || // Up
      isUnderAttackFromDirection(
        kingRow,
        kingCol,
        color,
        boardState,
        [1, 1],
        ["♗", "♝", "♕", "♛"]
      ) || // Down-Right
      isUnderAttackFromDirection(
        kingRow,
        kingCol,
        color,
        boardState,
        [1, -1],
        ["♗", "♝", "♕", "♛"]
      ) || // Down-Left
      isUnderAttackFromDirection(
        kingRow,
        kingCol,
        color,
        boardState,
        [-1, 1],
        ["♗", "♝", "♕", "♛"]
      ) || // Up-Right
      isUnderAttackFromDirection(
        kingRow,
        kingCol,
        color,
        boardState,
        [-1, -1],
        ["♗", "♝", "♕", "♛"]
      ) || // Up-Left
      isUnderAttackFromKnight(kingRow, kingCol, color, boardState) ||
      isUnderAttackFromPawn(kingRow, kingCol, color, boardState) ||
      isUnderAttackFromKing(kingRow, kingCol, color, boardState)
    );
  }

  // Add these new helper functions
  function isUnderAttackFromDirection(
    row,
    col,
    color,
    boardState,
    [rowDir, colDir],
    threatPieces
  ) {
    let currentRow = row + rowDir;
    let currentCol = col + colDir;

    while (
      currentRow >= 0 &&
      currentRow < 8 &&
      currentCol >= 0 &&
      currentCol < 8
    ) {
      const piece = boardState[currentRow][currentCol];
      if (piece) {
        if (piece.color !== color && threatPieces.includes(piece.piece)) {
          return true;
        }
        break; // Stop checking this direction if we hit any piece
      }
      currentRow += rowDir;
      currentCol += colDir;
    }
    return false;
  }

  function isUnderAttackFromKnight(row, col, color, boardState) {
    const knightMoves = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];

    return knightMoves.some(([rowOffset, colOffset]) => {
      const newRow = row + rowOffset;
      const newCol = col + colOffset;
      if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
        const piece = boardState[newRow][newCol];
        return (
          piece &&
          piece.color !== color &&
          (piece.piece === "♘" || piece.piece === "♞")
        );
      }
      return false;
    });
  }

  function isUnderAttackFromPawn(row, col, color, boardState) {
    // Check both upward and downward diagonals for enemy pawns
    const directions = [-1, 1]; // Check both up and down
    const attackerCols = [col - 1, col + 1]; // Check both left and right diagonals

    return directions.some((direction) => {
      const attackerRow = row + direction;

      // Skip if row is outside the board
      if (attackerRow < 0 || attackerRow >= 8) return false;

      return attackerCols.some((attackerCol) => {
        if (attackerCol >= 0 && attackerCol < 8) {
          const piece = boardState[attackerRow][attackerCol];
          if (piece && piece.color !== color) {
            // For white pawns, they attack downward (direction = 1)
            // For black pawns, they attack upward (direction = -1)
            const correctDirection =
              (piece.piece === "♙" && direction === 1) || // White pawn attacking down
              (piece.piece === "♟" && direction === -1); // Black pawn attacking up

            return (
              correctDirection && (piece.piece === "♙" || piece.piece === "♟")
            );
          }
        }
        return false;
      });
    });
  }

  function isUnderAttackFromKing(row, col, color, boardState) {
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (i === 0 && j === 0) continue;
        const newRow = row + i;
        const newCol = col + j;
        if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
          const piece = boardState[newRow][newCol];
          if (
            piece &&
            piece.color !== color &&
            (piece.piece === "♔" || piece.piece === "♚")
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function isSquareUnderAttack(row, col, color, boardState = board) {
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = boardState[i][j];
        if (piece && piece.color !== color) {
          // Skip the opposing king when checking for attacks
          // to prevent infinite recursion and invalid king captures
          if (piece.piece === "♔" || piece.piece === "♚") {
            const rowDiff = Math.abs(row - i);
            const colDiff = Math.abs(col - j);
            if (rowDiff <= 1 && colDiff <= 1) return true;
            continue;
          }

          // Use a simplified validation that doesn't check for check
          if (isValidMove(i, j, row, col, true)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function isCheckmate(color, boardState) {
    // Try all possible moves for all pieces
    for (let startRow = 0; startRow < 8; startRow++) {
      for (let startCol = 0; startCol < 8; startCol++) {
        const piece = boardState[startRow][startCol];
        if (piece && piece.color === color) {
          for (let endRow = 0; endRow < 8; endRow++) {
            for (let endCol = 0; endCol < 8; endCol++) {
              if (isValidMove(startRow, startCol, endRow, endCol)) {
                const tempBoard = boardState.map((row) => [...row]);
                tempBoard[endRow][endCol] = tempBoard[startRow][startCol];
                tempBoard[startRow][startCol] = null;
                if (!isKingInCheck(color, tempBoard)) return false;
              }
            }
          }
        }
      }
    }
    return true;
  }

  function playMoveSound() {
    const audio = audioRef.current;
    if (!isMuted) {
      const randomPitch = 0.8 + Math.random() * 0.4;
      audio.preservesPitch = false;
      audio.playbackRate = randomPitch;
      audio.currentTime = 0;
      audio.play().catch((error) => console.log("Error playing sound:", error));
    }
  }

  function playSelectSound() {
    const audio = selectAudioRef.current;
    if (!isMuted) {
      audio.currentTime = 0;
      audio.play().catch((error) => console.log("Error playing sound:", error));
    }
  }

  function handleSquareClick(row, col) {
    if (gameMode !== "game" || currentPlayer !== playerColor) return;

    if (gameStatus === "checkmate") return;

    if (!selectedPiece) {
      if (board[row][col] && board[row][col].color === currentPlayer) {
        playSelectSound();
        setSelectedPiece({ row, col });
      }
    } else {
      if (board[row][col] && board[row][col].color === currentPlayer) {
        playSelectSound();
        setSelectedPiece({ row, col });
        return;
      }

      if (isValidMove(selectedPiece.row, selectedPiece.col, row, col)) {
        // Play move sound with random pitch
        playMoveSound();

        // Start timer on first move
        if (!firstMoveMade) {
          setFirstMoveMade(true);
          setGameStartTime(Date.now());
        }

        const newBoard = [...board.map((row) => [...row])];
        const piece = board[selectedPiece.row][selectedPiece.col];

        // Set en passant target for two-square pawn moves
        if (
          (piece.piece === "♙" || piece.piece === "♟") &&
          Math.abs(row - selectedPiece.row) === 2
        ) {
          const direction = piece.color === "white" ? -1 : 1;
          setEnPassantTarget({
            row: selectedPiece.row + direction,
            col: selectedPiece.col,
          });
        } else {
          setEnPassantTarget(null);
        }

        // Track captured piece
        if (board[row][col]) {
          const capturedPiece = board[row][col];
          setCapturedPieces((prev) => ({
            ...prev,
            [playerColor]: [...prev[playerColor], capturedPiece.piece],
          }));
        }

        // Handle castling
        if (
          (board[selectedPiece.row][selectedPiece.col].piece === "♔" ||
            board[selectedPiece.row][selectedPiece.col].piece === "♚") &&
          Math.abs(col - selectedPiece.col) === 2
        ) {
          const rookCol = col > selectedPiece.col ? 7 : 0;
          const newRookCol = col > selectedPiece.col ? col - 1 : col + 1;
          newBoard[row][newRookCol] = newBoard[row][rookCol];
          newBoard[row][rookCol] = null;
        }

        // Move piece
        newBoard[row][col] = board[selectedPiece.row][selectedPiece.col];
        newBoard[selectedPiece.row][selectedPiece.col] = null;

        // Handle pawn promotion
        if (
          (newBoard[row][col].piece === "♙" && row === 0) ||
          (newBoard[row][col].piece === "♟" && row === 7)
        ) {
          newBoard[row][col].piece = currentPlayer === "white" ? "♕" : "♛";
        }

        // Update castling rights
        updateCastlingRights(selectedPiece.row, selectedPiece.col);

        setBoard(newBoard);
        setCurrentPlayer(playerColor === "white" ? "black" : "white");

        // Record move in history
        setMoveHistory([
          ...moveHistory,
          {
            piece: board[selectedPiece.row][selectedPiece.col].piece,
            from: { row: selectedPiece.row, col: selectedPiece.col },
            to: { row, col },
          },
        ]);

        // Send move to server
        ws.send(
          JSON.stringify({
            type: "MOVE",
            move: {
              from: { row: selectedPiece.row, col: selectedPiece.col },
              to: { row, col },
            },
            gameState: {
              board: newBoard,
              currentPlayer: playerColor === "white" ? "black" : "white",
              capturedPieces: {
                ...capturedPieces,
                [playerColor]: board[row][col]
                  ? [...capturedPieces[playerColor], board[row][col].piece]
                  : capturedPieces[playerColor],
              },
              gameStatus: gameStatus || "active",
            },
          })
        );
      }
      setSelectedPiece(null);
    }
  }

  function updateCastlingRights(row, col) {
    const piece = board[row][col];
    const newRights = { ...castlingRights };

    if (piece.piece === "♔") {
      newRights.white = { kingSide: false, queenSide: false };
    } else if (piece.piece === "♚") {
      newRights.black = { kingSide: false, queenSide: false };
    } else if (piece.piece === "♖" || piece.piece === "♜") {
      const color = piece.color;
      if (row === (color === "white" ? 7 : 0)) {
        if (col === 0) {
          newRights[color].queenSide = false;
        } else if (col === 7) {
          newRights[color].kingSide = false;
        }
      }
    }

    setCastlingRights(newRights);
  }

  function getPossibleMoves(row, col) {
    if (!board[row][col]) return [];

    const piece = board[row][col];

    // If this isn't the current player's piece, return empty array
    if (piece.color !== currentPlayer) {
      return [];
    }

    const moves = [];

    // If we're in check
    if (gameStatus === "check") {
      const { attackers, kingPosition } = findAttackingPieces(
        piece.color,
        board
      );

      // If there's more than one attacker and this isn't the king, no moves are possible
      if (attackers.length > 1 && piece.piece !== "♔" && piece.piece !== "♚") {
        return [];
      }

      // Check all possible squares
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          // Skip if trying to move to the same square
          if (row === i && col === j) continue;

          // Check if the move is valid according to all rules
          if (isValidMove(row, col, i, j)) {
            const tempBoard = board.map((row) => [...row]);
            tempBoard[i][j] = tempBoard[row][col];
            tempBoard[row][col] = null;

            // Only add moves that resolve the check
            if (!isKingInCheck(piece.color, tempBoard)) {
              moves.push({
                row: i,
                col: j,
                isCapture: board[i][j] !== null,
              });
            }
          }
        }
      }
      return moves;
    }

    // For non-check situations
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        if (isValidMove(row, col, i, j)) {
          moves.push({
            row: i,
            col: j,
            isCapture: board[i][j] !== null,
          });
        }
      }
    }
    return moves;
  }

  function isPieceBetweenPoints(x1, y1, x2, y2, px, py) {
    // For vertical line
    if (y1 === y2 && y1 === py) {
      return px > Math.min(x1, x2) && px < Math.max(x1, x2);
    }

    // For horizontal line
    if (x1 === x2 && x1 === px) {
      return py > Math.min(y1, y2) && py < Math.max(y1, y2);
    }

    // For diagonal line
    if (Math.abs(x2 - x1) === Math.abs(y2 - y1)) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const d = Math.abs(dx);

      for (let i = 1; i < d; i++) {
        const testX = x1 + (dx > 0 ? i : -i);
        const testY = y1 + (dy > 0 ? i : -i);
        if (testX === px && testY === py) return true;
      }
    }

    return false;
  }

  function isKingInCheckPosition(row, col) {
    const piece = board[row][col];
    return (
      piece &&
      (piece.piece === "♔" || piece.piece === "♚") &&
      piece.color === currentPlayer &&
      gameStatus === "check"
    );
  }

  function getPieceValue(piece) {
    switch (piece) {
      case "♙":
      case "♟":
        return 1;
      case "♘":
      case "♞":
      case "♗":
      case "♝":
        return 3;
      case "♖":
      case "♜":
        return 5;
      case "♕":
      case "♛":
        return 9;
      default:
        return 0;
    }
  }

  function calculatePoints(pieces) {
    if (!pieces) return 0;
    return pieces.reduce((sum, piece) => sum + getPieceValue(piece), 0);
  }

  function calculatePiecePosition(row, col) {
    return {
      x: col * 70, // 70 is the square width
      y: row * 70, // 70 is the square height
    };
  }

  function toggleMute() {
    setIsMuted(!isMuted);
    audioRef.current.muted = !isMuted;
  }

  const createRoom = (roomName) => {
    if (!wsConnected) {
      alert("Not connected to server. Please try again.");
      return;
    }
    if (!playerName.trim()) {
      alert("Please enter your name first");
      return;
    }
    ws.send(
      JSON.stringify({
        type: "CREATE_ROOM",
        roomName,
        playerName,
      })
    );
  };

  const joinRoom = (roomName) => {
    if (!wsConnected) {
      alert("Not connected to server. Please try again.");
      return;
    }
    if (!playerName.trim()) {
      alert("Please enter your name first");
      return;
    }
    ws.send(
      JSON.stringify({
        type: "JOIN_ROOM",
        roomName,
        playerName,
      })
    );
  };

  const forfeitGame = () => {
    ws.send(
      JSON.stringify({
        type: "FORFEIT",
      })
    );
    setGameMode("lobby");
    setCurrentRoom(null);
    setPlayerColor(null);
    setOpponent(null);
  };

  const handleOpponentMove = (move) => {
    if (!move || !move.gameState || !move.gameState.board) {
      console.error("Invalid move data received:", move);
      return;
    }

    playMoveSound();

    setBoard(move.gameState.board);
    setCurrentPlayer(move.gameState.currentPlayer);
    if (move.gameState.capturedPieces) {
      setCapturedPieces(move.gameState.capturedPieces);
    }
    if (move.gameState.gameStartTime) {
      setGameStartTime(move.gameState.gameStartTime);
      setFirstMoveMade(true);
    }
    setGameStatus(move.gameState.gameStatus || "active");
  };

  const handleGameOver = (data) => {
    if (!data.reason) {
      // Handle spectator leaving
      toast.info("You left the game", toastConfig);
      setGameMode("lobby");
      setGameStartTime(null);
      setElapsedTime(0);
      // ... rest of the code
    } else if (data.reason === "forfeit") {
      if (data.winner === "you") {
        toast.success("🏆 Opponent forfeited! You win!", toastConfig);
      } else {
        toast.info("You forfeited the game", toastConfig);
      }
      setGameMode("lobby");
      setCurrentRoom(null);
      setPlayerColor(null);
      setOpponent(null);
      setIsSpectator(false);
      setSpectatorCount(0);
      // Reset game state
      setBoard(initializeBoard());
      setCapturedPieces({ white: [], black: [] });
      setCurrentPlayer("white");
      setGameStatus("active");
    } else if (data.reason === "disconnect") {
      toast.success("🏆 Opponent disconnected! You win!", toastConfig);
      setGameMode("lobby");
      setCurrentRoom(null);
      setPlayerColor(null);
      setOpponent(null);
      setIsSpectator(false);
      setSpectatorCount(0);
      // Reset game state
      setBoard(initializeBoard());
      setCapturedPieces({ white: [], black: [] });
      setCurrentPlayer("white");
      setGameStatus("active");
    }
  };

  const spectateRoom = (roomName) => {
    if (!wsConnected) {
      alert("Not connected to server. Please try again.");
      return;
    }
    if (!playerName.trim()) {
      alert("Please enter your name first");
      return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      alert("Connection error. Please try again.");
      return;
    }

    ws.send(
      JSON.stringify({
        type: "SPECTATE_ROOM",
        roomName,
        playerName,
      })
    );
  };

  return (
    <div className="app-container">
      <ToastContainer
        position="top-center"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
      {gameMode === "lobby" ? (
        <div className="lobby">
          <h1 className="game-title">
            <span className="piece-icon">♔</span>Multiplayer Chess
          </h1>
          {!wsConnected ? (
            <div className="connection-status">
              <>
                <div className="loading-spinner"></div>
                Connecting to server...
              </>
            </div>
          ) : (
            <></>
          )}
          {!hasSetName ? (
            <div className="name-setup">
              <div className="input-group">
                <input
                  id="chess-player-name"
                  type="text"
                  placeholder="Enter your player name"
                  value={playerName}
                  onChange={handlePlayerNameChange}
                  autoComplete="off"
                  className="input-field"
                />
                <button
                  className="create-room-btn"
                  onClick={handleNameSubmit}
                  disabled={!playerName.trim()}
                >
                  Set Player Name
                </button>
              </div>
            </div>
          ) : (
            <></>
          )}
          {hasSetName && wsConnected && (
            <>
              <div className="game-mode-buttons">
                <button
                  className="game-mode-btn multiplayer"
                  onClick={createNewGame}
                >
                  Create Multiplayer Game
                </button>
                <button className="game-mode-btn local" onClick={createNewGame}>
                  Create Local Game
                </button>
                <button
                  className="game-mode-btn change-name"
                  onClick={() => setHasSetName(false)}
                >
                  Change Username
                </button>
              </div>
            </>
          )}
          <div className="room-list">
            {rooms.length === 0 ? (
              <div className="empty-rooms">
                <div className="empty-piece">♟</div>
                <p>No matches available</p>
                <span>Create a room to start playing!</span>
              </div>
            ) : (
              <>
                <div className="empty-rooms">
                  <h1 style={{ marginTop: "-2rem" }}>Active Matches</h1>
                  <span style={{ marginTop: "-1rem", marginBottom: "-1rem" }}>
                    Join a room to start playing!
                  </span>
                </div>
                {rooms.map((room) => (
                  <div key={room.name} className="room-item">
                    <div className="room-info">
                      <div className="room-header">
                        <h3>{room.name}</h3>
                        <div
                          className={`player-count ${
                            room.players === 2 ? "hide-on-mobile" : ""
                          }`}
                        >
                          {room.players}/2 Players
                          {room.players === 1 && (
                            <div className="waiting-piece">
                              <span className="piece">♟</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {room.inProgress && (
                        <div className="game-status">
                          <div className="room-time">
                            {room.gameStartTime ? (
                              <span className="elapsed-time">
                                {Math.floor(
                                  (Date.now() - room.gameStartTime) / 60000
                                )}
                                :
                                {Math.floor(
                                  ((Date.now() - room.gameStartTime) / 1000) %
                                    60
                                )
                                  .toString()
                                  .padStart(2, "0")}
                              </span>
                            ) : (
                              <span className="waiting-start">Not Started</span>
                            )}
                          </div>
                          <div className="score-display">
                            <div className="captured-preview white">
                              {room.capturedPieces?.white?.map((piece, i) => (
                                <span key={i} className="captured-piece">
                                  {piece}
                                </span>
                              ))}
                            </div>
                            <span className="score">
                              {room.scores?.white || 0} -{" "}
                              {room.scores?.black || 0}
                            </span>
                            <div className="captured-preview black">
                              {room.capturedPieces?.black?.map((piece, i) => (
                                <span key={i} className="captured-piece">
                                  {piece}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      {room.spectators > 0 && (
                        <span className="spectator-count">
                          👁 {room.spectators}
                        </span>
                      )}
                    </div>
                    <div className="room-actions">
                      {room.players < 2 && (
                        <button
                          className="join-btn"
                          onClick={() => joinRoom(room.name)}
                          disabled={!wsConnected || !playerName.trim()}
                        >
                          Join
                        </button>
                      )}
                      {(room.inProgress || room.players === 2) && (
                        <button
                          className="spectate-btn"
                          onClick={() => spectateRoom(room.name)}
                          disabled={!wsConnected || !playerName.trim()}
                        >
                          Spectate
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      ) : gameMode === "waiting" ? (
        <div className="waiting">
          <div className="waiting-animation">
            <div className="floating-pieces">
              <span className="piece white">♔</span>
              <span className="piece black">♚</span>
            </div>
            <h2>Waiting for opponent...</h2>
            <div className="loading-dots">
              <span>•</span>
              <span>•</span>
              <span>•</span>
            </div>
          </div>
          <button
            className="back-button"
            onClick={() => {
              ws.send(
                JSON.stringify({
                  type: "LEAVE_ROOM",
                })
              );
              setGameMode("lobby");
              setCurrentRoom(null);
              setPlayerColor(null);
            }}
          >
            Back to Lobby
          </button>
        </div>
      ) : (
        <div className="game-container">
          <div className="top-controls">
            <button
              className="mute-button"
              onClick={toggleMute}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? "🔇" : "🔊"}
            </button>
            <button
              className="settings-button"
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
            >
              ⚙️
            </button>
          </div>

          {showSettings && (
            <div className="settings-menu" ref={settingsRef}>
              {!showThemeMenu ? (
                <>
                  <h3>Settings</h3>
                  <div className="settings-options">
                    <button
                      className="icon-btn"
                      onClick={() => setShowThemeMenu(true)}
                      title="Board Themes"
                    >
                      🎨
                    </button>
                  </div>
                </>
              ) : (
                <div className="submenu-header">
                  <button
                    className="icon-btn"
                    onClick={() => setShowThemeMenu(false)}
                    title="Back"
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M19 12H5" />
                      <path d="M12 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h3>Board Themes</h3>
                </div>
              )}
              {showThemeMenu && (
                <div className="theme-options">
                  <button
                    className={`theme-btn ${
                      boardTheme === "classic" ? "active" : ""
                    }`}
                    onClick={() => setBoardTheme("classic")}
                  >
                    Classic
                  </button>
                  <button
                    className={`theme-btn ${
                      boardTheme === "midnight" ? "active" : ""
                    }`}
                    onClick={() => setBoardTheme("midnight")}
                  >
                    Midnight
                  </button>
                  <button
                    className={`theme-btn ${
                      boardTheme === "forest" ? "active" : ""
                    }`}
                    onClick={() => setBoardTheme("forest")}
                  >
                    Forest
                  </button>
                  <button
                    className={`theme-btn ${
                      boardTheme === "ocean" ? "active" : ""
                    }`}
                    onClick={() => setBoardTheme("ocean")}
                  >
                    Ocean
                  </button>
                  <button
                    className={`theme-btn ${
                      boardTheme === "desert" ? "active" : ""
                    }`}
                    onClick={() => setBoardTheme("desert")}
                  >
                    Desert
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="multiplayer-info">
            {isSpectator ? (
              <div className="player-status">
                <div className="player-card white">
                  <div className="player-piece">♔</div>
                  <div className="player-info">
                    <span className="player-name">
                      {isSpectator ? gamePlayers[0]?.name : playerName}
                    </span>
                    <span className="player-color">WHITE</span>
                    {currentPlayer === "white" && (
                      <span className="turn-indicator">Their Turn</span>
                    )}
                  </div>
                </div>
                <div className="vs-indicator">
                  {gameStatus === "checkmate" ? (
                    "Checkmate!"
                  ) : gameStatus === "check" ? (
                    "Check!"
                  ) : (
                    <>
                      <span className="vs-text">VS</span>
                      {firstMoveMade && gameStartTime && (
                        <span className="game-timer">
                          {!firstMoveMade ? "0:00" : formatTime(elapsedTime)}
                        </span>
                      )}
                      {isSpectator ? (
                        <button
                          className="leave-game-btn"
                          onClick={() => handleGameOver({})}
                        >
                          Leave Game
                        </button>
                      ) : (
                        <button
                          className="leave-game-btn"
                          onClick={forfeitGame}
                        >
                          <span className="forfeit-text-full">
                            Forfeit Game
                          </span>
                          <span className="forfeit-text-short">Forfeit</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
                <div className="player-card black">
                  <div className="player-piece">♚</div>
                  <div className="player-info">
                    <span className="player-name">
                      {isSpectator ? gamePlayers[1]?.name : opponent}
                    </span>
                    <span className="player-color">BLACK</span>
                    {currentPlayer === "black" && (
                      <span className="turn-indicator">Their Turn</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="player-status">
                <div className={`player-card ${playerColor}`}>
                  <div className="player-piece">
                    {playerColor === "white" ? "♔" : "♚"}
                  </div>
                  <div className="player-info">
                    <span className="player-name">{playerName}</span>
                    <span className="player-color">
                      {playerColor?.toUpperCase()}
                    </span>
                    {!isSpectator && currentPlayer === playerColor && (
                      <span className="turn-indicator">Your Turn</span>
                    )}
                  </div>
                </div>
                <div className="vs-indicator">
                  {gameStatus === "checkmate" ? (
                    "Checkmate!"
                  ) : gameStatus === "check" ? (
                    "Check!"
                  ) : (
                    <>
                      <span className="vs-text">VS</span>
                      {firstMoveMade && gameStartTime && (
                        <span className="game-timer">
                          {!firstMoveMade ? "0:00" : formatTime(elapsedTime)}
                        </span>
                      )}
                      <button className="leave-game-btn" onClick={forfeitGame}>
                        <span className="forfeit-text-full">Forfeit Game</span>
                        <span className="forfeit-text-short">Forfeit</span>
                      </button>
                    </>
                  )}
                </div>
                <div
                  className={`player-card ${
                    playerColor === "white" ? "black" : "white"
                  }`}
                >
                  <div className="player-piece">
                    {playerColor === "white" ? "♚" : "♔"}
                  </div>
                  <div className="player-info">
                    <span className="player-name">
                      {opponent || "Waiting..."}
                    </span>
                    <span className="player-color">
                      {playerColor === "white" ? "BLACK" : "WHITE"}
                    </span>
                    {!isSpectator && currentPlayer !== playerColor && (
                      <span className="turn-indicator">Their Turn</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="game-layout">
            <div className="captured-pieces-container">
              <div className="points-display">
                <span
                  className={
                    calculatePoints(
                      isSpectator
                        ? capturedPieces.black
                        : capturedPieces[playerColor]
                    ) > 0
                      ? "positive"
                      : calculatePoints(
                          isSpectator
                            ? capturedPieces.black
                            : capturedPieces[playerColor]
                        ) < 0
                      ? "negative"
                      : ""
                  }
                >
                  {calculatePoints(
                    isSpectator
                      ? capturedPieces.black
                      : capturedPieces[playerColor]
                  ) > 0
                    ? "+"
                    : ""}
                  {calculatePoints(
                    isSpectator
                      ? capturedPieces.black
                      : capturedPieces[playerColor]
                  )}
                </span>
              </div>
              <div
                className={`captured-pieces ${
                  isSpectator
                    ? "black"
                    : playerColor === "white"
                    ? "black"
                    : "white"
                }`}
              >
                {(isSpectator
                  ? capturedPieces.black
                  : capturedPieces[playerColor]
                ).map((piece, index) => (
                  <motion.div
                    key={index}
                    className="captured-piece"
                    data-color={
                      isSpectator
                        ? "black"
                        : playerColor === "white"
                        ? "black"
                        : "white"
                    }
                  >
                    <img
                      src={pieceImages[piece]}
                      alt={piece}
                      className="chess-piece-img"
                    />
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="chess-board">
              {(playerColor === "black" ? [...board].reverse() : board).map(
                (row, rowIndex) => (
                  <div key={rowIndex} className="board-row">
                    {(playerColor === "black" ? [...row].reverse() : row).map(
                      (square, colIndex) => {
                        const actualRow =
                          playerColor === "black" ? 7 - rowIndex : rowIndex;
                        const actualCol =
                          playerColor === "black" ? 7 - colIndex : colIndex;

                        const isSelected =
                          selectedPiece?.row === actualRow &&
                          selectedPiece?.col === actualCol;
                        const possibleMove =
                          selectedPiece &&
                          getPossibleMoves(
                            selectedPiece.row,
                            selectedPiece.col
                          ).find(
                            (move) =>
                              move.row === actualRow && move.col === actualCol
                          );
                        const isInCheck = isKingInCheckPosition(
                          actualRow,
                          actualCol
                        );

                        return (
                          <div
                            key={`${actualRow}-${actualCol}`}
                            className={`square ${
                              (actualRow + actualCol) % 2 === 0
                                ? `light ${boardTheme}`
                                : `dark ${boardTheme}`
                            } ${isSelected ? "selected" : ""} ${
                              possibleMove ? "possible-move" : ""
                            } ${isInCheck ? "in-check" : ""}`}
                            onClick={() =>
                              handleSquareClick(actualRow, actualCol)
                            }
                          >
                            <AnimatePresence mode="popLayout">
                              {square && (
                                <motion.div
                                  data-color={square.color}
                                  initial="initial"
                                  animate={isSelected ? "selected" : "initial"}
                                  variants={pieceVariants}
                                  layoutId={`piece-${square.piece}-${actualRow}-${actualCol}`}
                                  transition={{
                                    duration: 0.3,
                                    ease: "easeOut",
                                    layout: {
                                      duration: 0.3,
                                      ease: "easeOut",
                                    },
                                  }}
                                >
                                  <img
                                    src={pieceImages[square.piece]}
                                    alt={square.piece}
                                    className="chess-piece-img"
                                  />
                                </motion.div>
                              )}
                            </AnimatePresence>
                            {possibleMove && (
                              <div
                                className={`move-indicator ${
                                  possibleMove.isCapture ? "capture" : ""
                                }`}
                              >
                                {possibleMove.isCapture ? "×" : "•"}
                              </div>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                )
              )}
            </div>
            <div className="captured-pieces-container">
              <div className="points-display">
                <span
                  className={
                    calculatePoints(
                      capturedPieces[
                        isSpectator
                          ? "white"
                          : playerColor === "white"
                          ? "black"
                          : "white"
                      ]
                    ) >
                    calculatePoints(
                      isSpectator
                        ? capturedPieces.black
                        : capturedPieces[playerColor]
                    )
                      ? "winning"
                      : calculatePoints(
                          capturedPieces[
                            isSpectator
                              ? "white"
                              : playerColor === "white"
                              ? "black"
                              : "white"
                          ]
                        ) <
                        calculatePoints(
                          isSpectator
                            ? capturedPieces.black
                            : capturedPieces[playerColor]
                        )
                      ? "negative-score"
                      : ""
                  }
                >
                  {calculatePoints(
                    capturedPieces[
                      isSpectator
                        ? "white"
                        : playerColor === "white"
                        ? "black"
                        : "white"
                    ]
                  ) > 0
                    ? "+"
                    : ""}
                  {calculatePoints(
                    capturedPieces[
                      isSpectator
                        ? "white"
                        : playerColor === "white"
                        ? "black"
                        : "white"
                    ]
                  )}
                </span>
              </div>
              <div
                className={`captured-pieces ${
                  isSpectator
                    ? "white"
                    : playerColor === "white"
                    ? "black"
                    : "white"
                }`}
              >
                {(isSpectator
                  ? capturedPieces.white
                  : capturedPieces[playerColor === "white" ? "black" : "white"]
                ).map((piece, index) => (
                  <div
                    key={index}
                    className="captured-piece"
                    data-color={
                      isSpectator
                        ? "white"
                        : playerColor === "white"
                        ? "black"
                        : "white"
                    }
                  >
                    <img
                      src={pieceImages[piece]}
                      alt={piece}
                      className="chess-piece-img"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="spectator-info">
            <span>👁 {spectatorCount}</span>
          </div>
        </div>
      )}
    </div>
  );
}
