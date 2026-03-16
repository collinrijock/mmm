import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, PanInfo } from "motion/react";
import { api } from "./api";
import Admin from "./Admin";

interface Meme {
  id: string;
  text: string;
  eloRating: number;
  timesShown: number;
  timesLiked: number;
}

interface MemeUser {
  id: string;
  username: string;
}

interface Stats {
  totalMemes: number;
  userSwipes: number;
  totalSwipes: number;
  progress: number;
  topMeme: { text: string; rating: number } | null;
}

export default function App() {
  const [view, setView] = useState<"login" | "swipe" | "admin">("login");
  const [password, setPassword] = useState("");
  const [users, setUsers] = useState<MemeUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
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
  const [newUsername, setNewUsername] = useState("");

  // Check for saved session
  useEffect(() => {
    const savedUserId = localStorage.getItem("mmm_user_id");
    const savedUsername = localStorage.getItem("mmm_username");
    const savedPw = localStorage.getItem("mmm_admin_pw");
    if (savedUserId && savedUsername && savedPw) {
      setUserId(savedUserId);
      setUsername(savedUsername);
      setPassword(savedPw);
      setView("swipe");
    }
  }, []);

  // After password is validated, fetch the user list
  const fetchUsers = useCallback(async (pw: string) => {
    try {
      const res = await api(`/admin?pw=${encodeURIComponent(pw)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.users || []).map((u: { id: string; username: string }) => ({
        id: u.id,
        username: u.username,
      }));
    } catch {
      return [];
    }
  }, []);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const userList = await fetchUsers(password);
    if (userList.length === 0) {
      // Password might be wrong, or no users yet — try auth to validate pw
      try {
        const res = await api("/auth", {
          method: "POST",
          body: JSON.stringify({ username: "__pw_check__", password }),
        });
        if (!res.ok) {
          const d = await res.json();
          setError(d.error || "Invalid password");
          return;
        }
      } catch {
        setError("Invalid password");
        return;
      }
    }
    localStorage.setItem("mmm_admin_pw", password);
    setUsers(userList);
    if (userList.length > 0) {
      setSelectedUserId(userList[0].id);
    }
  };

  const handleSelectAccount = () => {
    if (!selectedUserId) return;
    const user = users.find((u) => u.id === selectedUserId);
    if (!user) return;
    setUserId(user.id);
    setUsername(user.username);
    localStorage.setItem("mmm_user_id", user.id);
    localStorage.setItem("mmm_username", user.username);
    setView("swipe");
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    setError("");
    try {
      const res = await api("/auth", {
        method: "POST",
        body: JSON.stringify({ username: newUsername.trim(), password }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to create account");
      }
      const data = await res.json();
      setUserId(data.user.id);
      setUsername(data.user.username);
      localStorage.setItem("mmm_user_id", data.user.id);
      localStorage.setItem("mmm_username", data.user.username);
      setNewUsername("");
      setView("swipe");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("mmm_user_id");
    localStorage.removeItem("mmm_username");
    localStorage.removeItem("mmm_admin_pw");
    setUserId(null);
    setUsername("");
    setPassword("");
    setUsers([]);
    setView("login");
  };

  // --- Swipe logic ---

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

  useEffect(() => {
    if (view === "swipe" && userId) {
      fetchNextMeme();
      fetchStats();
    }
  }, [view, userId, fetchNextMeme, fetchStats]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (view !== "swipe" || !currentMeme) return;
      if (e.key === "ArrowLeft") handleSwipe("left");
      else if (e.key === "ArrowRight") handleSwipe("right");
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [view, currentMeme, handleSwipe]);

  // --- Admin view ---

  if (view === "admin") {
    return <Admin onBack={() => setView("swipe")} />;
  }

  // --- Login view ---

  if (view === "login") {
    const hasPassword = users.length > 0 || localStorage.getItem("mmm_admin_pw");

    // Step 1: enter password
    if (!hasPassword) {
      return (
        <div className="min-h-dvh bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
            <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              MMM
            </h1>
            <p className="text-center text-gray-600 mb-8">
              Meme Ranking Battle
            </p>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
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

    // Step 2: pick account from dropdown
    return (
      <div className="min-h-dvh bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
          <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            MMM
          </h1>
          <p className="text-center text-gray-600 mb-8">Pick your account</p>

          {users.length > 0 && (
            <div className="space-y-4 mb-6">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white text-gray-800 cursor-pointer"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                  </option>
                ))}
              </select>
              <button
                onClick={handleSelectAccount}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer"
              >
                Continue as {users.find((u) => u.id === selectedUserId)?.username}
              </button>
            </div>
          )}

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-3 text-gray-500">
                or create new
              </span>
            </div>
          </div>

          <form onSubmit={handleCreateAccount} className="space-y-4">
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              placeholder="New username"
              required
            />
            {error && (
              <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm">
                {error}
              </div>
            )}
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors cursor-pointer"
            >
              Create account
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- Leaderboard view ---

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

  // --- Swipe view ---

  return (
    <div className="min-h-dvh bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex flex-col">
      <div className="p-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="text-white">
            <h1 className="text-2xl font-bold">MMM</h1>
            <p className="text-sm opacity-80">@{username}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView("admin")}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 text-sm backdrop-blur-sm transition-colors cursor-pointer"
            >
              Admin
            </button>
            <button
              onClick={() => {
                fetchLeaderboard();
                setShowLeaderboard(true);
              }}
              className="px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm transition-colors cursor-pointer"
            >
              Leaderboard
            </button>
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/60 text-sm backdrop-blur-sm transition-colors cursor-pointer"
            >
              Logout
            </button>
          </div>
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
