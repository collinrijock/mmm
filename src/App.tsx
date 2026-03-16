import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "./api";

interface Meme {
  id: string;
  text: string;
  eloRating: number;
  timesShown: number;
}

interface MemePair {
  memeA: Meme;
  memeB: Meme;
}

interface MemeUser {
  id: string;
  username: string;
}

interface Stats {
  totalMemes: number;
  userBattles: number;
  totalBattles: number;
  totalPairs: number;
  topMeme: { text: string; rating: number } | null;
}

function haptic(type: "pick" | "both") {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(type === "pick" ? 30 : [40, 20, 40]);
    }
  } catch {
    // not supported
  }
}

export default function App() {
  const [view, setView] = useState<"pick" | "password" | "battle">("pick");
  const [password, setPassword] = useState("");
  const [users, setUsers] = useState<MemeUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUsername, setSelectedUsername] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState("");

  // Two-slot buffer: current pair + prefetched next pair
  const [pair, setPair] = useState<MemePair | null>(null);
  const [nextPair, setNextPair] = useState<MemePair | null>(null);
  const prefetching = useRef(false);

  const [stats, setStats] = useState<Stats | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<Meme[]>([]);
  const [picking, setPicking] = useState<"a" | "b" | "both" | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [error, setError] = useState("");

  // Restore saved session
  useEffect(() => {
    const savedUserId = localStorage.getItem("mmm_user_id");
    const savedUsername = localStorage.getItem("mmm_username");
    const savedPw = localStorage.getItem("mmm_pw");
    if (savedPw) setPassword(savedPw);
    if (savedUserId && savedUsername) {
      setUserId(savedUserId);
      setUsername(savedUsername);
      setView("battle");
      return;
    }
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await api("/auth");
      if (!res.ok) return;
      const data = await res.json();
      const list: MemeUser[] = (data.users || []).map(
        (u: { id: string; username: string }) => ({ id: u.id, username: u.username })
      );
      setUsers(list);
      if (list.length > 0) {
        setSelectedUserId(list[0].id);
        setSelectedUsername(list[0].username);
      }
    } catch { /* ignore */ }
  };

  const loginWithPassword = async (uname: string, pw: string) => {
    setError("");
    try {
      const res = await api("/auth", {
        method: "POST",
        body: JSON.stringify({ username: uname, password: pw }),
      });
      if (res.status === 401) { setError("Wrong password"); return false; }
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Login failed");
      }
      const data = await res.json();
      setUserId(data.user.id);
      setUsername(data.user.username);
      localStorage.setItem("mmm_user_id", data.user.id);
      localStorage.setItem("mmm_username", data.user.username);
      localStorage.setItem("mmm_pw", pw);
      setView("battle");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      return false;
    }
  };

  const handlePickUser = async () => {
    if (!selectedUserId) return;
    const cachedPw = password || localStorage.getItem("mmm_pw");
    if (cachedPw) {
      const ok = await loginWithPassword(selectedUsername, cachedPw);
      if (ok) return;
      localStorage.removeItem("mmm_pw");
      setPassword("");
    }
    setView("password");
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await loginWithPassword(selectedUsername, password);
  };

  const handleLogout = () => {
    localStorage.removeItem("mmm_user_id");
    localStorage.removeItem("mmm_username");
    setUserId(null);
    setUsername("");
    setPair(null);
    setNextPair(null);
    fetchUsers();
    setView("pick");
  };

  // --- Pair fetching with prefetch buffer ---

  const fetchOnePair = useCallback(async (uid: string): Promise<MemePair | null> => {
    try {
      const res = await api(`/memes/battle?userId=${uid}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  const prefetchNext = useCallback(async (uid: string) => {
    if (prefetching.current) return;
    prefetching.current = true;
    const p = await fetchOnePair(uid);
    setNextPair(p);
    prefetching.current = false;
  }, [fetchOnePair]);

  const fetchStats = useCallback(async (uid: string) => {
    try {
      const res = await api(`/stats?userId=${uid}`);
      if (!res.ok) return;
      setStats(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const res = await api("/memes/leaderboard?limit=20");
      if (!res.ok) return;
      setLeaderboard(await res.json());
    } catch { /* ignore */ }
  };

  // Initial load: fetch first pair + prefetch second in parallel
  useEffect(() => {
    if (view === "battle" && userId) {
      setInitialLoading(true);
      Promise.all([fetchOnePair(userId), fetchOnePair(userId), fetchStats(userId)]).then(
        ([first, second]) => {
          setPair(first);
          setNextPair(second);
          setInitialLoading(false);
        }
      );
    }
  }, [view, userId, fetchOnePair, fetchStats]);

  const handleVote = useCallback(
    (pick: "a" | "b" | "both") => {
      if (!pair || !userId || picking) return;

      haptic(pick === "both" ? "both" : "pick");
      setPicking(pick);

      // Swap to prefetched next pair instantly after a brief flash
      setTimeout(() => {
        setPair(nextPair);
        setNextPair(null);
        setPicking(null);
        // Kick off prefetch for the one after
        prefetchNext(userId);
      }, 150);

      // Fire vote + stats in background — don't block UI
      api("/memes/vote", {
        method: "POST",
        body: JSON.stringify({
          userId,
          memeAId: pair.memeA.id,
          memeBId: pair.memeB.id,
          pick: pick === "both" ? "both_suck" : pick,
        }),
      })
        .then(() => fetchStats(userId))
        .catch(console.error);
    },
    [pair, nextPair, userId, picking, prefetchNext, fetchStats]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (view !== "battle" || !pair) return;
      if (e.key === "ArrowLeft") handleVote("a");
      else if (e.key === "ArrowRight") handleVote("b");
      else if (e.key === " ") { e.preventDefault(); handleVote("both"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, pair, handleVote]);

  // --- Pick screen ---
  if (view === "pick") {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
          <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            MMM
          </h1>
          <p className="text-center text-gray-600 mb-8">Who are you?</p>
          {users.length > 0 && (
            <div className="space-y-4">
              <select
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  const u = users.find((u) => u.id === e.target.value);
                  if (u) setSelectedUsername(u.username);
                }}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white text-gray-800 cursor-pointer"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.username}</option>
                ))}
              </select>
              <button
                onClick={handlePickUser}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer"
              >
                Continue as {users.find((u) => u.id === selectedUserId)?.username}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Password screen ---
  if (view === "password") {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
          <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            MMM
          </h1>
          <p className="text-center text-gray-600 mb-1">Hey {selectedUsername}</p>
          <p className="text-center text-gray-400 text-sm mb-8">Enter your password</p>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              placeholder="Password"
              autoFocus
              required
            />
            {error && (
              <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm">{error}</div>
            )}
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            >
              Enter
            </button>
            <button
              type="button"
              onClick={() => { setView("pick"); setError(""); setPassword(""); }}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
            >
              Not you? Go back
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- Leaderboard ---
  if (showLeaderboard) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Top Memes
              </h2>
              <button
                onClick={() => setShowLeaderboard(false)}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer text-sm"
              >
                Back
              </button>
            </div>
            {leaderboard.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No battles yet.</p>
            ) : (
              <div className="space-y-3">
                {leaderboard.map((meme, i) => (
                  <div key={meme.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                    <div className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-800 text-sm leading-snug">{meme.text}</p>
                      <p className="text-xs text-gray-400 mt-1">{Math.round(meme.eloRating)} ELO</p>
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

  // --- Battle view ---
  return (
    <div className="min-h-dvh bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex flex-col">
      {/* Header */}
      <div className="p-4 shrink-0">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="text-white">
            <h1 className="text-xl font-bold">MMM</h1>
            <p className="text-xs opacity-70">@{username}</p>
          </div>
          <div className="flex items-center gap-2">
            {stats && (
              <span className="text-white/70 text-xs">{stats.userBattles} battles</span>
            )}
            <button
              onClick={() => { fetchLeaderboard(); setShowLeaderboard(true); }}
              className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm backdrop-blur-sm transition-colors cursor-pointer"
            >
              Leaderboard
            </button>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/60 text-sm backdrop-blur-sm transition-colors cursor-pointer"
            >
              Switch
            </button>
          </div>
        </div>
      </div>

      {/* Arena */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
        <div className="w-full max-w-2xl">
          <p className="text-center text-white/80 text-sm font-medium mb-3 tracking-wide uppercase">
            Which is funnier?
          </p>

          <AnimatePresence mode="popLayout">
            {initialLoading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center py-20"
              >
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-white border-t-transparent" />
              </motion.div>
            )}

            {!initialLoading && !pair && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-3xl shadow-2xl p-10 text-center"
              >
                <p className="text-2xl font-bold text-gray-800 mb-2">All done!</p>
                <p className="text-gray-500 mb-6">You&apos;ve judged every pair.</p>
                <button
                  onClick={() => { fetchLeaderboard(); setShowLeaderboard(true); }}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                >
                  View Results
                </button>
              </motion.div>
            )}

            {!initialLoading && pair && (
              <motion.div
                key={pair.memeA.id + pair.memeB.id}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.1 }}
                className="grid grid-cols-2 gap-3"
              >
                <MemeCard
                  meme={pair.memeA}
                  highlighted={picking === "a"}
                  dimmed={picking === "b" || picking === "both"}
                  onClick={() => handleVote("a")}
                  side="left"
                />
                <MemeCard
                  meme={pair.memeB}
                  highlighted={picking === "b"}
                  dimmed={picking === "a" || picking === "both"}
                  onClick={() => handleVote("b")}
                  side="right"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {!initialLoading && pair && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 flex justify-center"
            >
              <button
                onClick={() => handleVote("both")}
                disabled={!!picking}
                className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all cursor-pointer
                  ${picking === "both"
                    ? "bg-gray-700 text-white scale-95"
                    : "bg-white/20 hover:bg-white/30 active:scale-95 text-white backdrop-blur-sm"
                  }`}
              >
                💀 Both Suck
              </button>
            </motion.div>
          )}

          {!initialLoading && pair && (
            <p className="text-center text-white/30 text-xs mt-3">
              ← → arrow keys · space = both suck
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MemeCard({
  meme,
  highlighted,
  dimmed,
  onClick,
  side,
}: {
  meme: Meme;
  highlighted: boolean;
  dimmed: boolean;
  onClick: () => void;
  side: "left" | "right";
}) {
  return (
    <motion.button
      onClick={onClick}
      animate={{
        scale: highlighted ? 1.04 : dimmed ? 0.96 : 1,
        opacity: dimmed ? 0.35 : 1,
      }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      className={`relative w-full rounded-2xl shadow-xl p-5 flex flex-col items-start text-left cursor-pointer select-none min-h-40
        ${highlighted
          ? "bg-gradient-to-br from-purple-500 to-pink-500 text-white ring-4 ring-white/60"
          : "bg-white text-gray-800 hover:bg-gray-50 active:scale-95"
        }`}
    >
      <p className={`text-base leading-relaxed font-medium mb-4 ${highlighted ? "text-white" : "text-gray-800"}`}>
        {meme.text}
      </p>

      <span
        className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full mt-auto ${
          highlighted ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"
        }`}
      >
        {Math.round(meme.eloRating)} ELO
      </span>

      <div
        className={`absolute bottom-3 ${side === "left" ? "left-3" : "right-3"} text-base opacity-15`}
      >
        {side === "left" ? "←" : "→"}
      </div>
    </motion.button>
  );
}
