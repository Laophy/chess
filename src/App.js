import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import { motion, AnimatePresence } from "framer-motion";
import moveSound from "./sounds/chess_move.mp3";

const pieceVariants = {
  initial: { scale: 1 },
  selected: { scale: 1.2, filter: "brightness(1.2)" },
};

export default function App() {
  const audioRef = useRef(new Audio(moveSound));
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

  function handleSquareClick(row, col) {
    if (gameStatus === "checkmate") return;

    if (!selectedPiece) {
      if (board[row][col] && board[row][col].color === currentPlayer) {
        setSelectedPiece({ row, col });
      }
    } else {
      if (isValidMove(selectedPiece.row, selectedPiece.col, row, col)) {
        // Play move sound with random pitch
        playMoveSound();

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
            [currentPlayer]: [...prev[currentPlayer], capturedPiece.piece],
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
        setCurrentPlayer(currentPlayer === "white" ? "black" : "white");

        // Record move in history
        setMoveHistory([
          ...moveHistory,
          {
            piece: board[selectedPiece.row][selectedPiece.col].piece,
            from: { row: selectedPiece.row, col: selectedPiece.col },
            to: { row, col },
          },
        ]);
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

  return (
    <div className="app-container">
      <button
        className="mute-button"
        onClick={toggleMute}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? "🔇" : "🔊"}
      </button>
      <div className="game-layout">
        <div className="captured-pieces-container">
          <div className="points-display">
            <span
              className={
                calculatePoints(capturedPieces.white) >
                calculatePoints(capturedPieces.black)
                  ? "winning"
                  : ""
              }
            >
              {calculatePoints(capturedPieces.white) >
              calculatePoints(capturedPieces.black)
                ? "+"
                : ""}
              {calculatePoints(capturedPieces.white) -
                calculatePoints(capturedPieces.black)}
            </span>
          </div>
          <div className="captured-pieces black">
            {capturedPieces.white.map((piece, index) => (
              <div key={index} className="captured-piece" data-color="black">
                {piece}
              </div>
            ))}
          </div>
        </div>
        <div className="chess-board">
          {board.map((row, rowIndex) => (
            <div key={rowIndex} className="board-row">
              {row.map((square, colIndex) => {
                const isSelected =
                  selectedPiece?.row === rowIndex &&
                  selectedPiece?.col === colIndex;
                const possibleMove =
                  selectedPiece &&
                  getPossibleMoves(selectedPiece.row, selectedPiece.col).find(
                    (move) => move.row === rowIndex && move.col === colIndex
                  );
                const isInCheck = isKingInCheckPosition(rowIndex, colIndex);

                return (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    className={`square ${
                      (rowIndex + colIndex) % 2 === 0 ? "light" : "dark"
                    } ${isSelected ? "selected" : ""} ${
                      possibleMove ? "possible-move" : ""
                    } ${isInCheck ? "in-check" : ""}`}
                    onClick={() => handleSquareClick(rowIndex, colIndex)}
                  >
                    <AnimatePresence mode="popLayout">
                      {square && (
                        <motion.div
                          data-color={square.color}
                          initial="initial"
                          animate={isSelected ? "selected" : "initial"}
                          variants={pieceVariants}
                          layoutId={`piece-${square.piece}-${rowIndex}-${colIndex}`}
                          transition={{
                            duration: 0.3,
                            ease: "easeOut",
                            layout: {
                              duration: 0.3,
                              ease: "easeOut",
                            },
                          }}
                        >
                          {square.piece}
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
              })}
            </div>
          ))}
        </div>
        <div className="captured-pieces-container">
          <div className="points-display">
            <span
              className={
                calculatePoints(capturedPieces.black) >
                calculatePoints(capturedPieces.white)
                  ? "winning"
                  : ""
              }
            >
              {calculatePoints(capturedPieces.black) >
              calculatePoints(capturedPieces.white)
                ? "+"
                : ""}
              {calculatePoints(capturedPieces.black) -
                calculatePoints(capturedPieces.white)}
            </span>
          </div>
          <div className="captured-pieces white">
            {capturedPieces.black.map((piece, index) => (
              <div key={index} className="captured-piece" data-color="white">
                {piece}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={`game-info ${gameStatus}`}>
        <div
          className={`player-indicator ${currentPlayer}`}
          title={`${currentPlayer}'s turn`}
        />
        {gameStatus === "checkmate" ? (
          <span>
            Checkmate! {currentPlayer === "white" ? "Black" : "White"} wins! 🏆
          </span>
        ) : gameStatus === "check" ? (
          <span>Check! {currentPlayer}'s king is under attack</span>
        ) : (
          <span>
            {currentPlayer.charAt(0).toUpperCase() + currentPlayer.slice(1)}'s
            turn
          </span>
        )}
      </div>
    </div>
  );
}
