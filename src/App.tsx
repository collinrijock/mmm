import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, PanInfo } from "motion/react";
import { api } from "./api";

interface Meme {
  id: string;
  text: string;
  eloRating: number;
  timesShown: number;
  timesLiked: number;
}

interface Stats {
  totalMemes: number;
  userSwipes: number;
  totalSwipes: number;
  progress: number;
  topMeme: { text: string; rating: number } | null;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [currentMeme, setCurrentMeme] = useState<Meme | null>(null);
  const [previousMemeId, setPreviousMemeId] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<Meme[]>([]);
  const [swipeDirection, setSwipeDirection] = useState<
    "left" | "right" | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchNextMeme = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const res = await api(`/memes/next?userId=${userId}`);
      if (res.status === 404) {
        setCurrentMeme(null);
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch meme");
      setCurrentMeme(await res.json());
    } catch (err) {
      setError("Failed to load meme");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const fetchStats = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await api(`/stats?userId=${userId}`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      setStats(await res.json());
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, [userId]);

  const fetchLeaderboard = async () => {
    try {
      const res = await api("/memes/leaderboard?limit=10");
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      setLeaderboard(await res.json());
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
    }
  };

  const handleSwipe = useCallback(
    async (direction: "left" | "right") => {
      if (!currentMeme || !userId) return;
      setSwipeDirection(direction);

      setTimeout(async () => {
        try {
          await api("/memes/swipe", {
            method: "POST",
            body: JSON.stringify({
              userId,
              memeId: currentMeme.id,
              direction,
              previousMemeId,
            }),
          });
          setPreviousMemeId(direction === "right" ? currentMeme.id : null);
          setSwipeDirection(null);
          await fetchNextMeme();
          await fetchStats();
        } catch (err) {
          console.error("Failed to record swipe:", err);
        }
      }, 300);
    },
    [currentMeme, userId, previousMemeId, fetchNextMeme, fetchStats]
  );

  const handleDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    const threshold = 100;
    if (info.offset.x > threshold) handleSwipe("right");
    else if (info.offset.x < -threshold) handleSwipe("left");
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await api("/auth", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Authentication failed");
      }
      const data = await res.json();
      setUserId(data.user.id);
      setIsAuthenticated(true);
      localStorage.setItem("mmm_user_id", data.user.id);
      localStorage.setItem("mmm_username", data.user.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    }
  };

  useEffect(() => {
    const savedUserId = localStorage.getItem("mmm_user_id");
    const savedUsername = localStorage.getItem("mmm_username");
    if (savedUserId && savedUsername) {
      setUserId(savedUserId);
      setUsername(savedUsername);
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && userId) {
      fetchNextMeme();
      fetchStats();
    }
  }, [isAuthenticated, userId, fetchNextMeme, fetchStats]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!currentMeme) return;
      if (e.key === "ArrowLeft") handleSwipe("left");
      else if (e.key === "ArrowRight") handleSwipe("right");
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [currentMeme, handleSwipe]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
          <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            MMM
          </h1>
          <p className="text-center text-gray-600 mb-8">Meme Ranking Battle</p>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                placeholder="Enter your username"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                placeholder="Shared password"
                required
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            >
              Enter
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (showLeaderboard) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Top Memes
              </h2>
              <button
                onClick={() => setShowLeaderboard(false)}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
              >
                Back
              </button>
            </div>

            {leaderboard.length === 0 ? (
              <p className="text-center text-gray-500">
                No memes ranked yet. Keep swiping!
              </p>
            ) : (
              <div className="space-y-4">
                {leaderboard.map((meme, index) => (
                  <div
                    key={meme.id}
                    className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xl">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-800 mb-2">{meme.text}</p>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>Rating: {Math.round(meme.eloRating)}</span>
                        <span>&middot;</span>
                        <span>{meme.timesLiked} likes</span>
                        <span>&middot;</span>
                        <span>{meme.timesShown} views</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex flex-col">
      <div className="p-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="text-white">
            <h1 className="text-2xl font-bold">MMM</h1>
            <p className="text-sm opacity-80">@{username}</p>
          </div>
          <button
            onClick={() => {
              fetchLeaderboard();
              setShowLeaderboard(true);
            }}
            className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm transition-colors cursor-pointer"
          >
            Leaderboard
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          {stats && (
            <div className="mb-6 bg-white/20 backdrop-blur-sm rounded-2xl p-4 text-white">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold">{stats.userSwipes}</div>
                  <div className="text-sm opacity-80">Your Swipes</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {Math.round(stats.progress)}%
                  </div>
                  <div className="text-sm opacity-80">Progress</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{stats.totalSwipes}</div>
                  <div className="text-sm opacity-80">Total Swipes</div>
                </div>
              </div>
            </div>
          )}

          <div className="relative h-96">
            <AnimatePresence>
              {currentMeme && (
                <motion.div
                  key={currentMeme.id}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={1}
                  onDragEnd={handleDragEnd}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{
                    scale: 1,
                    opacity: 1,
                    x:
                      swipeDirection === "left"
                        ? -500
                        : swipeDirection === "right"
                          ? 500
                          : 0,
                    rotate:
                      swipeDirection === "left"
                        ? -45
                        : swipeDirection === "right"
                          ? 45
                          : 0,
                  }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="absolute inset-0"
                >
                  <div className="h-full bg-white rounded-3xl shadow-2xl p-8 flex items-center justify-center cursor-grab active:cursor-grabbing">
                    <p className="text-2xl text-gray-800 text-center leading-relaxed">
                      {currentMeme.text}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!currentMeme && !loading && (
              <div className="absolute inset-0 bg-white rounded-3xl shadow-2xl p-8 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-2xl text-gray-800 mb-4">All done!</p>
                  <p className="text-gray-600 mb-6">
                    You&apos;ve seen all the memes.
                  </p>
                  <button
                    onClick={() => {
                      fetchLeaderboard();
                      setShowLeaderboard(true);
                    }}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    View Results
                  </button>
                </div>
              </div>
            )}

            {loading && (
              <div className="absolute inset-0 bg-white rounded-3xl shadow-2xl p-8 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent" />
              </div>
            )}
          </div>

          {currentMeme && !loading && (
            <div className="mt-8 flex items-center justify-center gap-8">
              <button
                onClick={() => handleSwipe("left")}
                className="w-20 h-20 rounded-full bg-white shadow-xl flex items-center justify-center text-4xl hover:scale-110 transition-transform active:scale-95 cursor-pointer"
              >
                &#x274C;
              </button>
              <button
                onClick={() => handleSwipe("right")}
                className="w-20 h-20 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 shadow-xl flex items-center justify-center text-4xl hover:scale-110 transition-transform active:scale-95 cursor-pointer"
              >
                &#x2764;&#xFE0F;
              </button>
            </div>
          )}

          <div className="mt-6 text-center text-white/80 text-sm">
            Use arrow keys: &larr; for pass, &rarr; for like
          </div>
        </div>
      </div>
    </div>
  );
}
