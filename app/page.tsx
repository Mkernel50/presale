"use client";

import { useEffect, useState } from "react";
import { Sliders as Spider, Trophy, Users, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TonConnectButton, useTonConnectUI } from "@tonconnect/ui-react";
import { db } from '@/lib/firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  writeBatch,
  increment,
  runTransaction
} from 'firebase/firestore';
import { Toast } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast"

// Create a simple toast interface for this component
interface ToastProps {
  message: string;
  type: "success" | "error" | "info";
  duration?: number;
}

// Simplified toast function
const toast = ({ message, type = "info" }: ToastProps) => {
  alert(`${type.toUpperCase()}: ${message}`);
};

interface Referral {
  referrer: string;
  totalAmount: number;
  referralCount: number;
  validInvites: number;
  eligibleInvites: number;
}

// Add this new interface after the existing interfaces
interface ReferrerStats {
  referrer: string;
  totalAmount: number;
  referralCount: number;
  validInvites: number;
  eligibleInvites: number;
}

// Add these interfaces at the top with other interfaces
interface InviteData {
  total: number;
  referrals: string[];
}

interface PlayerData {
  walletAddress: string;
  feeders: number;
  totalInvites: number;
  eligibleInvites: InviteData;
  validInvites: InviteData;
  invalidInvites: InviteData;
  spiderBalance: number;
  feedersClaimed: string[]; // Array of addresses that have claimed feeders
  referrer?: string; // Add referrer field
  suiWalletAddress?: string;
}

export default function Home() {
  const { toast } = useToast()
  
  // Remove the old toast state and handlers
  // ...existing code...
  
  // Replace showToast with this implementation
  const showToast = ({ message, type = "info" }: ToastProps) => {
    toast({
      title: type.charAt(0).toUpperCase() + type.slice(1),
      description: message,
      variant: type === "error" ? "destructive" : "default",
    })
  };
  
  // Remove removeToast as it's no longer needed
  const [tonConnectUI] = useTonConnectUI();
  const [connected, setConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [tonBalance, setTonBalance] = useState("0");
  const [spiderBalance, setSpiderBalance] = useState("0");
  const [amount, setAmount] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [leaderboard, setLeaderboard] = useState<Referral[]>([]);
  const [userReferralCode, setUserReferralCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingBalances, setIsFetchingBalances] = useState(false);
  const [isFetchingLeaderboard, setIsFetchingLeaderboard] = useState(false);
  const [savedReferrer, setSavedReferrer] = useState<string | null>(null);
  const [referralStats, setReferralStats] = useState<{
    invalidInvites: number;
    validInvites: number;
    eligibleInvites: number;
  }>({ invalidInvites: 0, validInvites: 0, eligibleInvites: 0 });
  const [feedersBalance, setFeedersBalance] = useState<number>(0);
  const [toasts, setToasts] = useState<Array<{
    id: string;
    message: string;
    type: "success" | "error" | "info";
  }>>([]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const contractAddress = "EQBUMjg7ROfjh_ou3Lz1lpNrTJN59h2S-Wm-ZPsWWVzn-xc9";
  const receiverAddress = "UQAVhdnM_-BLbS6W4b1BF5UyGWuIapjXRZjNJjfve7StCqST";

  // Monitor wallet connection status
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const wallet = tonConnectUI.wallet;
        if (wallet) {
          const walletAddress = wallet.account.address;
          const referralCode = walletAddress.slice(0, 8);
          setConnected(true);
          setWalletAddress(walletAddress);
          setUserReferralCode(referralCode);

          const batch = writeBatch(db);

          // Initialize player document ONLY using referral code
          const playerDoc = doc(db, 'players', referralCode);
          const playerSnap = await getDoc(playerDoc);

          // Only create new player document if it doesn't exist
          if (!playerSnap.exists()) {
            batch.set(playerDoc, {
              walletAddress: walletAddress,
              totalInvites: 0,
              spiderBalance: 0,
              feeders: 0,
              feedersClaimed: [],
              validInvites: {
                total: 0,
                referrals: []
              },
              eligibleInvites: {
                total: 0,
                referrals: []
              },
              invalidInvites: {
                total: 0,
                referrals: []
              },
              referrer: null, // Add referrer field with null default
              createdAt: new Date().toISOString(),
              lastUpdated: new Date().toISOString()
            });
          } else {
            // Just update lastActive if document exists
            batch.update(playerDoc, {
              lastUpdated: new Date().toISOString()
            });
          }

          await batch.commit();
          
          // Fetch initial stats after initialization
          await Promise.all([
            fetchReferralStats(),
            fetchFeedersBalance(),
            fetchLeaderboard()
          ]);
        } else {
          setWalletAddress(null);
          setUserReferralCode("");
        }
      } catch (err) {
        console.error("Error checking wallet connection:", err);
        setConnected(false);
        setWalletAddress(null);
      }
    };

    checkConnection();

    // Set up event listener for wallet connection changes
    tonConnectUI.onStatusChange(async (wallet) => {
      setConnected(!!wallet);
      if (wallet) {
        setWalletAddress(wallet.account.address);
        setUserReferralCode(wallet.account.address.slice(0, 8));
        await fetchBalances(wallet.account.address);
        await fetchLeaderboard();
      } else {
        setWalletAddress(null);
        setUserReferralCode("");
        setTonBalance("0");
        setSpiderBalance("0");
      }
    });
  }, [tonConnectUI]);

  // Initial data fetch when wallet is connected
  useEffect(() => {
    if (connected && walletAddress) {
      fetchBalances(walletAddress);
      fetchLeaderboard();
    }
  }, [connected, walletAddress]);

  // Load saved referrer from local storage on component mount
  useEffect(() => {
    try {
      const storedReferrer = localStorage.getItem('spiderReferrer');
      if (storedReferrer) {
        setSavedReferrer(storedReferrer);
      }
    } catch (err) {
      console.error("Error reading from local storage:", err);
    }
  }, []);

  // Set referrer in input field if saved
  useEffect(() => {
    if (savedReferrer && referralCode === '') {
      setReferralCode(savedReferrer);
    }
  }, [savedReferrer, referralCode]);

  // After the initial effects, add an effect to fetch feeders balance
  useEffect(() => {
    if (connected && walletAddress) {
      fetchFeedersBalance();
    }
  }, [connected, walletAddress]);

  // Add new effect to refresh stats on page load
  useEffect(() => {
    if (connected && walletAddress && userReferralCode) {
      Promise.all([
        fetchReferralStats(),
        fetchFeedersBalance(),
        fetchLeaderboard()
      ]);
    }
  }, [connected, walletAddress, userReferralCode]);

  const fetchBalances = async (address?: string) => {
    if (!address && !walletAddress) return;
    
    const addressToUse = address || walletAddress;
    if (!addressToUse) return;

    setIsFetchingBalances(true);
    try {
      // Get referral code from wallet address
      const referralCode = addressToUse.slice(0, 8);

      // Get player doc using referral code
      const playerDoc = doc(db, 'players', referralCode);
      const playerSnap = await getDoc(playerDoc);
      const dbSpiderBalance = playerSnap.exists() ? (playerSnap.data().spiderBalance || 0) : 0;
      
      // Use Promise.all to fetch TON balance
      const tonResponse = await fetch(`https://tonapi.io/v2/accounts/${addressToUse}`, {
        headers: { 'Accept': 'application/json' }
      });

      if (!tonResponse.ok) {
        console.error("TON API error:", tonResponse.status);
        setTonBalance("Error");
      } else {
        const tonData = await tonResponse.json();
        setTonBalance((tonData.balance / 1e9).toFixed(2));
      }

      // Set SPIDER balance from player document
      setSpiderBalance(dbSpiderBalance.toFixed(2));
    } catch (error) {
      console.error("Error fetching balances:", error);
      setError("Failed to fetch balances. Please try again.");
    } finally {
      setIsFetchingBalances(false);
    }
  };

  // Update fetchLeaderboard function
  const fetchLeaderboard = async () => {
    setIsFetchingLeaderboard(true);
    try {
      const playersRef = collection(db, 'players');
      const playersSnap = await getDocs(playersRef);
      
      const leaderboardData = playersSnap.docs
        .map(doc => {
          const data = doc.data() as PlayerData;
          return {
            referrer: doc.id,
            totalAmount: 0, // Will be updated from purchases
            validInvites: data.validInvites?.total || 0,
            eligibleInvites: data.eligibleInvites?.total || 0,
            referralCount: (data.validInvites?.total || 0) + (data.eligibleInvites?.total || 0)
          };
        })
        .filter(player => player.referralCount > 0)
        .sort((a, b) => {
          if (b.referralCount !== a.referralCount) {
            return b.referralCount - a.referralCount;
          }
          return b.eligibleInvites - a.eligibleInvites;
        })
        .slice(0, 10);

      setLeaderboard(leaderboardData);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      setLeaderboard([]);
    } finally {
      setIsFetchingLeaderboard(false);
    }
  };

  // Combine all referral stats functionality into one function
  const fetchReferralStats = async () => {
    if (!connected || !userReferralCode) return;
    
    try {
      const playerDoc = doc(db, 'players', userReferralCode);
      const playerSnap = await getDoc(playerDoc);
      
      if (playerSnap.exists()) {
        const data = playerSnap.data() as PlayerData;
        
        // Get unique referrals counting
        const invalidInvites = new Set(data.invalidInvites?.referrals || []);
        const validInvites = new Set(data.validInvites?.referrals || []);
        const eligibleInvites = new Set(data.eligibleInvites?.referrals || []);

        setReferralStats({
          invalidInvites: invalidInvites.size,
          validInvites: validInvites.size,
          eligibleInvites: eligibleInvites.size
        });
        setFeedersBalance(data.feeders || 0);
      } else {
        // Initialize if doesn't exist
        const initialData = {
          walletAddress: walletAddress,
          spiderBalance: 0,          // Add spiderBalance field
          feeders: 0,
          feedersClaimed: [],        // Add feedersClaimed array
          totalInvites: 0,
          eligibleInvites: { total: 0, referrals: [] },
          validInvites: { total: 0, referrals: [] },
          invalidInvites: { total: 0, referrals: [] },
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        };
        await setDoc(playerDoc, initialData);
        
        setReferralStats({
          invalidInvites: 0,
          validInvites: 0,
          eligibleInvites: 0
        });
        setFeedersBalance(0);
      }
    } catch (error) {
      console.error("Error fetching referral stats:", error);
    }
  };

  // Function to check if user has a referrer
  const checkUserReferrer = async () => {
    if (!walletAddress) return null;
    
    try {
      const userRefDoc = doc(db, 'user_referrals', walletAddress);
      const docSnap = await getDoc(userRefDoc);
      return docSnap.exists() ? docSnap.data().referrer : null;
    } catch (error) {
      console.error("Error checking user referrer:", error);
      return null;
    }
  };

  // Function to verify if a referral code is valid
  const verifyReferralCode = async (code: string) => {
    // Prevent self-referral
    if (code === userReferralCode) {
      showToast({
        message: "You cannot use your own referral code",
        type: "error"
      });
      return false;
    }

    // Check format: must start with "0:" followed by 6 characters
    const referralFormat = /^0:[a-z0-9]{6}$/i;
    if (!referralFormat.test(code)) {
      showToast({
        message: "Invalid referral code format. Must be in format '0:xxxxxx' where x is alphanumeric",
        type: "error"
      });
      return false;
    }

    return true;
  };

  // Function to create referral record if it doesn't exist
  const createReferralIfNeeded = async (code: string) => {
    try {
      const referralDoc = doc(db, 'referrals', code);
      const referralSnap = await getDoc(referralDoc);
      
      if (!referralSnap.exists()) {
        await setDoc(referralDoc, {
          totalAmount: 0,
          referralCount: 0,
          validInvites: 0,
          eligibleInvites: 0,
          invalidInvites: 0,
          lastUpdated: new Date().toISOString()
        });
      }
      
      return true;
    } catch (error) {
      console.error("Error creating referral:", error);
      return false;
    }
  };

  // Function to fetch user's feeders balance
  const fetchFeedersBalance = async () => {
    if (!walletAddress) return;
    
    try {
      // Use referral code (first 8 chars) as document ID
      const referralCode = walletAddress.slice(0, 8);
      const playerDoc = doc(db, 'players', referralCode);
      const docSnap = await getDoc(playerDoc);
      
      setFeedersBalance(docSnap.exists() ? (docSnap.data().feeders || 0) : 0);
    } catch (error) {
      console.error("Error fetching feeders balance:", error);
    }
  };

  // Function to distribute rewards for referrals
  const distributeReferralRewards = async (referrerCode: string, buyerAddress: string) => {
    if (!referrerCode || !buyerAddress) return;
    
    try {
      const batch = writeBatch(db);
      const FEEDERS_REWARD = 5;

      // Get referrer doc
      const referrerDoc = doc(db, 'players', referrerCode);
      const referrerSnap = await getDoc(referrerDoc);
      const referrerData = referrerSnap.data() as PlayerData;

      // Check if buyer has already claimed feeders from this referrer
      if (referrerData.feedersClaimed?.includes(buyerAddress)) {
        return; // Already claimed feeders, skip distribution
      }

      // Update referrer's feeders and claimed list
      batch.set(referrerDoc, {
        feeders: (referrerData.feeders || 0) + FEEDERS_REWARD,
        feedersClaimed: [...(referrerData.feedersClaimed || []), buyerAddress]
      }, { merge: true });

      // Update buyer's feeders
      const buyerDoc = doc(db, 'players', buyerAddress);
      const buyerSnap = await getDoc(buyerDoc);
      const buyerData = buyerSnap.exists() ? buyerSnap.data() as PlayerData : {
        walletAddress: buyerAddress,
        feeders: 0,
        feedersClaimed: []
      };

      batch.set(buyerDoc, {
        feeders: (buyerData.feeders || 0) + FEEDERS_REWARD
      }, { merge: true });

      await batch.commit();

      // Update UI for current user
      if (buyerAddress === walletAddress || referrerCode === userReferralCode) {
        await fetchFeedersBalance();
      }

      showToast({
        message: `First purchase rewards distributed! Both users received ${FEEDERS_REWARD} feeders.`,
        type: "success"
      });

    } catch (error) {
      console.error("Error distributing rewards:", error);
      showToast({
        message: "Failed to distribute rewards",
        type: "error"
      });
    }
  };

  // Helper function to update feeders balance
  const updateFeedersBalance = async (userAddress: string, amount: number) => {
    const batch = writeBatch(db);
    try {
      // Use referral code (first 8 chars) as document ID
      const referralCode = userAddress.slice(0, 8);
      const playerDoc = doc(db, 'players', referralCode);
      const docSnap = await getDoc(playerDoc);
      
      const currentFeeders = docSnap.exists() ? (docSnap.data().feeders || 0) : 0;
      const newBalance = currentFeeders + amount;

      batch.set(playerDoc, {
        feeders: newBalance,
        lastUpdated: new Date().toISOString()
      }, { merge: true });

      await batch.commit();
      
      if (userAddress === walletAddress) {
        setFeedersBalance(newBalance);
      }
    } catch (error) {
      console.error("Error updating feeders balance:", error);
      throw error;
    }
  };

  // Update the existing handleBuy function to track purchases
  const handleBuy = async () => {
    if (!connected || !walletAddress || !userReferralCode) return;
    setIsLoading(true);
  
    try {
      const purchaseAmount = parseFloat(amount);
      if (!purchaseAmount || purchaseAmount <= 0) throw new Error("Invalid amount");
      
      const spiderAmount = purchaseAmount / 0.02;
  
      // Process blockchain transaction first
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{
          address: receiverAddress,
          amount: (purchaseAmount * 1e9).toString()
        }]
      });
  
      const batch = writeBatch(db);
  
      // Update buyer's document
      const playerDoc = doc(db, 'players', userReferralCode);
      const playerSnap = await getDoc(playerDoc);
      
      // Update player's SPIDER balance
      const currentData = playerSnap.exists() ? playerSnap.data() as PlayerData : {
        walletAddress: walletAddress,
        spiderBalance: 0,
        feeders: 0,
        feedersClaimed: [],
        totalInvites: 0,
        validInvites: { total: 0, referrals: [] },
        eligibleInvites: { total: 0, referrals: [] },
        invalidInvites: { total: 0, referrals: [] },
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };
  
      const newSpiderBalance = (currentData.spiderBalance || 0) + spiderAmount;
      
      batch.set(playerDoc, {
        ...currentData,
        spiderBalance: newSpiderBalance,
        lastUpdated: new Date().toISOString()
      }, { merge: true });
  
      // Update referrer stats if exists
      if (savedReferrer) {
        const referrerDoc = doc(db, 'players', savedReferrer);
        const referrerSnap = await getDoc(referrerDoc);
        const referrerData = referrerSnap.exists() ? referrerSnap.data() as PlayerData : null;
  
        if (referrerData) {
          const isFirstPurchase = !referrerData.validInvites.referrals.includes(walletAddress);
          const updates: any = {};
  
          if (isFirstPurchase) {
            // Remove from invalid invites if present
            if (referrerData.invalidInvites?.referrals?.includes(walletAddress)) {
              updates.invalidInvites = {
                total: Math.max((referrerData.invalidInvites?.total || 0) - 1, 0),
                referrals: referrerData.invalidInvites.referrals.filter(addr => addr !== walletAddress)
              };
            }
  
            // Add to valid invites only if not already present
            updates.validInvites = {
              total: (referrerData.validInvites?.total || 0) + 1,
              referrals: [...(referrerData.validInvites?.referrals || []), walletAddress]
            };
  
            // First purchase feeders reward
            if (!referrerData.feedersClaimed?.includes(walletAddress)) {
              updates.feeders = (referrerData.feeders || 0) + 5;
              updates.feedersClaimed = [...(referrerData.feedersClaimed || []), walletAddress];
  
              // Also give feeders to buyer
              batch.set(playerDoc, {
                feeders: (currentData.feeders || 0) + 5,
                feedersClaimed: [...(currentData.feedersClaimed || []), savedReferrer]
              }, { merge: true });
            }
          }
  
          // Handle eligible invites for large purchases
          const isEligiblePurchase = purchaseAmount >= 100;
          if (isEligiblePurchase && !referrerData.eligibleInvites.referrals.includes(walletAddress)) {
            updates.eligibleInvites = {
              total: (referrerData.eligibleInvites?.total || 0) + 1,
              referrals: [...(referrerData.eligibleInvites?.referrals || []), walletAddress]
            };
          }
  
          // Only update if there are changes
          if (Object.keys(updates).length > 0) {
            batch.set(referrerDoc, updates, { merge: true });
          }
        }
      }
  
      // Create purchase record
      const purchaseRef = doc(db, 'purchases', `${walletAddress}_${Date.now()}`);
      batch.set(purchaseRef, {
        buyer: walletAddress,
        amount: purchaseAmount,
        spiderAmount: spiderAmount,
        timestamp: new Date().toISOString(),
        status: 'completed',
        referrer: savedReferrer
      });
  
      // Commit all changes
      await batch.commit();
  
      // Update UI
      await Promise.all([
        fetchReferralStats(),
        savedReferrer && updateReferrerStats(savedReferrer),
        fetchLeaderboard(),
        fetchBalances()
      ]);
  
      setAmount("");
      showToast({ message: "Purchase successful!", type: "success" });
  
    } catch (error: any) {
      console.error("Transaction error:", error);
      showToast({ message: error.message || "Transaction failed", type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast({
        message: "Referral code copied to clipboard!",
        type: "success"
      });
    } catch (err) {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        showToast({
          message: "Referral code copied to clipboard!",
          type: "success"
        });
      } catch (err) {
        showToast({
          message: "Failed to copy code. Please try manually copying.",
          type: "error"
        });
      }
      document.body.removeChild(textArea);
    }
  };

  const handleBindReferralCode = async () => {
    if (!referralCode || !connected || !walletAddress) {
      showToast({ 
        message: "Please connect your wallet and enter a referral code",
        type: "error"
      });
      return;
    }

    // Verify referral code format first
    if (!await verifyReferralCode(referralCode)) {
      return;
    }
    
    try {
      // First perform all reads
      const [userRefDoc, playerDoc] = await Promise.all([
        getDoc(doc(db, 'user_referrals', walletAddress)),
        getDoc(doc(db, 'players', referralCode))
      ]);
  
      if (userRefDoc.exists()) {
        showToast({ message: "Already have a referrer", type: "error" });
        return;
      }
  
      // Create initial batch for atomic writes
      const batch = writeBatch(db);
  
      // 1. Create/Update player document for referrer
      const playerRef = doc(db, 'players', referralCode);
      const playerData = playerDoc.exists() ? playerDoc.data() as PlayerData : {
        walletAddress: '',
        feeders: 0,
        totalInvites: 0,
        eligibleInvites: { total: 0, referrals: [] },
        validInvites: { total: 0, referrals: [] },
        invalidInvites: { total: 0, referrals: [] }
      };
  
      batch.set(playerRef, {
        ...playerData,
        invalidInvites: {
          total: (playerData.invalidInvites?.total || 0) + 1,
          referrals: [...(playerData.invalidInvites?.referrals || []), walletAddress]
        }
      }, { merge: true });
  
      // 2. Record referral relationship
      batch.set(doc(db, 'user_referrals', walletAddress), {
        user: walletAddress,
        referrer: referralCode,
        timestamp: new Date().toISOString()
      });
  
      // 3. Create feeders balance doc if needed
      const balanceDoc = doc(db, 'feeders_balances', walletAddress);
      const balanceSnap = await getDoc(balanceDoc);
      if (!balanceSnap.exists()) {
        batch.set(balanceDoc, {
          balance: 0,
          last_updated: new Date().toISOString()
        });
      }
  
      // Update the current player's document to include the referrer
      const currentPlayerDoc = doc(db, 'players', userReferralCode);
      batch.update(currentPlayerDoc, {
        referrer: referralCode,
        lastUpdated: new Date().toISOString()
      });
  
      // Commit all changes
      await batch.commit();
  
      // Update both referrer's and user's stats
      await Promise.all([
        fetchReferralStats(), // This single function now handles all stats updates
        savedReferrer && updateReferrerStats(savedReferrer) // Update referrer's stats if exists
      ]);
  
      localStorage.setItem('spiderReferrer', referralCode);
      setSavedReferrer(referralCode);
      showToast({ message: "Referral code bound successfully!", type: "success" });
  
    } catch (err) {
      console.error("Error binding referral code:", err);
      showToast({ message: "Failed to bind referral code", type: "error" });
    }
  };

  const handlePurchase = async () => {
    if (!connected || !walletAddress) {
      showToast({
        message: "Please connect your wallet first",
        type: "error"
      });
      return;
    }
  
    try {
      const purchaseAmount = parseFloat(amount);
      if (!purchaseAmount || purchaseAmount <= 0) {
        throw new Error("Please enter a valid amount.");
      }
  
      const batch = writeBatch(db);

      // First check and create necessary data structures
      const [playerDoc, balanceDoc] = await Promise.all([
        savedReferrer ? getDoc(doc(db, 'players', savedReferrer)) : null,
        getDoc(doc(db, 'feeders_balances', walletAddress))
      ]);

      // Create initial data structures if they don't exist
      if (savedReferrer && !playerDoc?.exists()) {
        batch.set(doc(db, 'players', savedReferrer), {
          walletAddress: savedReferrer,
          feeders: 0,
          totalInvites: 0,
          eligibleInvites: { total: 0, referrals: [] },
          validInvites: { total: 0, referrals: [] },
          invalidInvites: { total: 0, referrals: [] }
        });
      }

      if (!balanceDoc.exists()) {
        batch.set(doc(db, 'feeders_balances', walletAddress), {
          balance: 0,
          last_updated: new Date().toISOString()
        });
      }

      // Create purchase record
      const purchaseRef = doc(db, 'purchases', `${walletAddress}_${Date.now()}`);
      batch.set(purchaseRef, {
        buyer: walletAddress,
        amount: purchaseAmount,
        timestamp: new Date().toISOString(),
        status: 'pending',
        referrer: savedReferrer
      });

      // Update player stats if there's a referrer
      if (savedReferrer && playerDoc) {
        const playerData = playerDoc.exists() ? playerDoc.data() as PlayerData : {
          walletAddress: savedReferrer,
          feeders: 0,
          totalInvites: 0,
          eligibleInvites: { total: 0, referrals: [] },
          validInvites: { total: 0, referrals: [] },
          invalidInvites: { total: 0, referrals: [] }
        };

        const updates = {
          totalInvites: (playerData.totalInvites || 0) + 1,
          validInvites: {
            total: (playerData.validInvites?.total || 0) + 1,
            referrals: [...(playerData.validInvites?.referrals || []), walletAddress]
          },
          eligibleInvites: {
            total: (playerData.eligibleInvites?.total || 0),
            referrals: [...(playerData.eligibleInvites?.referrals || [])]
          }
        };

        if (purchaseAmount >= 100) {
          updates.eligibleInvites = {
            total: (playerData.eligibleInvites?.total || 0) + 1,
            referrals: [...(playerData.eligibleInvites?.referrals || []), walletAddress]
          };
        }

        batch.set(doc(db, 'players', savedReferrer), updates, { merge: true });
      }

      // Commit the batch before proceeding with blockchain transaction
      await batch.commit();

      // Process blockchain transaction
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{
          address: receiverAddress,
          amount: (purchaseAmount * 1e9).toString()
        }]
      });
  
      if (savedReferrer) {
        await distributeReferralRewards(savedReferrer, walletAddress);
      }
  
      // Refresh all data
      await Promise.all([
        fetchBalances(),
        fetchLeaderboard(),
        fetchReferralStats()
      ]);
  
      setAmount("");
      showToast({
        message: "Purchase successful!",
        type: "success"
      });
  
    } catch (error: any) {
      console.error("Transaction error:", error);
      showToast({
        message: error.message || "Transaction failed. Please try again.",
        type: "error"
      });
    }
  };

  // Add new helper function to update referrer stats
  const updateReferrerStats = async (referrerCode: string) => {
    try {
      const playerDoc = doc(db, 'players', referrerCode);
      const playerSnap = await getDoc(playerDoc);
      
      if (playerSnap.exists()) {
        const data = playerSnap.data() as PlayerData;
        // Force a re-render of stats by updating state
        setReferralStats({
          invalidInvites: data.invalidInvites?.referrals?.length || 0,
          validInvites: data.validInvites?.referrals?.length || 0,
          eligibleInvites: data.eligibleInvites?.referrals?.length || 0
        });
      }
    } catch (error) {
      console.error("Error updating referrer stats:", error);
    }
  };

  const [suiWalletAddress, setSuiWalletAddress] = useState("");

  // Add the handler for SUI wallet submission
  const handleSuiWalletSubmit = async () => {
    if (!connected || !walletAddress) {
      showToast({ 
        message: "Please connect your wallet first",
        type: "error"
      });
      return;
    }

    if (!suiWalletAddress) {
      showToast({ 
        message: "Please enter your SUI wallet address",
        type: "error"
      });
      return;
    }

    try {
      const playerDoc = doc(db, 'players', userReferralCode);
      await updateDoc(playerDoc, {
        suiWalletAddress: suiWalletAddress,
        lastUpdated: new Date().toISOString()
      });

      // Fetch updated player data
      await fetchPlayerData();

      showToast({
        message: "SUI wallet address saved successfully!",
        type: "success"
      });
      setSuiWalletAddress("");
    } catch (error) {
      console.error("Error saving SUI wallet:", error);
      showToast({
        message: "Failed to save SUI wallet address",
        type: "error"
      });
    }
  };

  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  
  // Add fetchPlayerData function
  const fetchPlayerData = async () => {
    if (!connected || !userReferralCode) return;
    
    try {
      const playerDoc = doc(db, 'players', userReferralCode);
      const playerSnap = await getDoc(playerDoc);
      
      if (playerSnap.exists()) {
        setPlayerData(playerSnap.data() as PlayerData);
      } else {
        setPlayerData(null);
      }
    } catch (error) {
      console.error("Error fetching player data:", error);
      setPlayerData(null);
    }
  };

  // Add useEffect to fetch player data when connected
  useEffect(() => {
    if (connected && userReferralCode) {
      fetchPlayerData();
    }
  }, [connected, userReferralCode]);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a1b3b] to-[#2a2b5b] flex items-center justify-center p-4">
        <Card className="bg-white/10 backdrop-blur-lg border-none text-white max-w-md w-full">
          <CardContent className="p-6">
            <div className="flex items-center justify-center mb-4 text-red-400">
              <AlertCircle className="mr-2 h-6 w-6" />
            </div>
            <p className="text-red-400 text-center">{error}</p>
            <Button 
              onClick={() => setError(null)} 
              className="w-full mt-4 bg-[#28a745] hover:bg-[#28a745]/90"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#1a1b3b] to-[#2a2b5b] flex items-center justify-center p-4">
      <div className="max-w-[800px] w-full text-center p-5">
        <div className="mb-8">
          <div className="w-32 h-32 mx-auto mb-6">
            {/* Use the SVG logo from the public folder */}
            <img 
              src="/logo.png" 
              alt="Gem Spider Logo" 
              className="w-full h-full object-contain"
              onError={(e) => {
                // Fallback to Spider icon if image fails to load
                e.currentTarget.style.display = 'none';
                const fallbackDiv = document.createElement('div');
                fallbackDiv.className = 'text-[#00A3FF]';
                fallbackDiv.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>';
                e.currentTarget.parentNode?.appendChild(fallbackDiv);
              }}
            />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">Gem Spider</h1>
          <p className="text-xl text-white/90">
            Token Pre Sale - Get your $SPIDER tokens now!
          </p>
          
          {/* Debug Info - Remove in production */}
          <div className="mt-2 p-2 bg-white/5 rounded text-xs text-white/50">
            Wallet Status: {connected ? "Connected" : "Disconnected"} | 
            Address: {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "None"}
          </div>
        </div>

        <div className="absolute top-4 right-4">
          <TonConnectButton />
        </div>

        <Tabs defaultValue="buy" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 bg-white/10">
            <TabsTrigger value="buy">Buy Tokens</TabsTrigger>
            <TabsTrigger value="referral">Referral</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          </TabsList>

          <TabsContent value="buy">
            <Card className="bg-white/10 backdrop-blur-lg border-none text-white">
              <CardHeader>
                <CardTitle className="text-2xl">Token Pre-sale</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="space-y-2 text-lg">
                    <div className="flex items-center justify-between">
                      <p>TON Balance:</p>
                      {isFetchingBalances ? (
                        <div className="flex items-center">
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          <span>Loading...</span>
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <p className="mr-2">{tonBalance} TON</p>
                          {connected && (
                            <Button 
                              onClick={() => fetchBalances()} 
                              variant="outline" 
                              size="sm" 
                              className="h-7 w-7 rounded-full p-0 bg-white/20 hover:bg-white/30 border-white/20 flex items-center justify-center"
                              disabled={isFetchingBalances}
                            >
                              {isFetchingBalances ? 
                                <RefreshCw className="h-3 w-3 animate-spin" /> : 
                                <RefreshCw className="h-3 w-3" />
                              }
                              <span className="sr-only">Refresh Balances</span>
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <p>$SPIDER Balance:</p>
                      {isFetchingBalances ? (
                        <div className="flex items-center">
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          <span>Loading...</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p>{spiderBalance} $SPIDER</p>
                          {parseFloat(spiderBalance) >= 100 && (
                            <span className="text-green-400">✅ Eligible</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold">Buy $SPIDER Tokens</h3>
                    <div className="p-4 bg-white/5 rounded-lg">
                      <p className="text-lg mb-2">Rate: 0.02 TON = 1 $SPIDER</p>
                      <div className="flex flex-col gap-2">
                        <Input
                          type="number"
                          placeholder="Enter TON amount"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                          disabled={isLoading}
                        />
                        <div className="text-sm text-white/80">
                          You will receive: {amount ? (parseFloat(amount) / 0.02).toFixed(2) : '0'} $SPIDER
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={handleBuy}
                      className="w-full bg-[#28a745] hover:bg-[#28a745]/90"
                      disabled={isLoading || !connected}
                    >
                      {isLoading ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        'Buy $SPIDER'
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="referral">
            <Card className="bg-white/10 backdrop-blur-lg border-none text-white">
              <CardHeader>
                <CardTitle className="flex items-center justify-center gap-2">
                  <Users className="h-6 w-6" />
                  Your Referral Program
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {connected && userReferralCode ? (
                  <div className="space-y-4">
                    <p className="text-lg">Your Referral Code:</p>
                    <div className="bg-white/20 p-4 rounded-lg text-2xl font-mono flex justify-between items-center">
                      <span>{userReferralCode}</span>
                      <Button 
                        onClick={() => {
                          // Use a more reliable clipboard approach
                          try {
                            const textArea = document.createElement('textarea');
                            textArea.value = userReferralCode;
                            textArea.style.position = 'fixed';  // Avoid scrolling to bottom
                            document.body.appendChild(textArea);
                            textArea.focus();
                            textArea.select();
                            const successful = document.execCommand('copy');
                            document.body.removeChild(textArea);
                            
                            if (successful) {
                              showToast({
                                message: "Referral code copied to clipboard!",
                                type: "success"
                              });
                            } else {
                              throw new Error('Copy command was unsuccessful');
                            }
                          } catch (err) {
                            console.error('Failed to copy text: ', err);
                            showToast({
                              message: "Failed to copy text. Please try again.",
                              type: "error"
                            });
                          }
                        }} 
                        variant="default" 
                        size="sm"
                        className="bg-gradient-to-r from-[#3c28a7] to-[#9f2dfd] hover:from-[#3c28a7]/80 hover:to-[#9f2dfd]/80 text-white border-none"
                      >
                        Copy
                      </Button>
                    </div>
                    
                    <div className="mt-6 mb-8 space-y-4">
                      <h3 className="text-xl font-semibold">Bind a Referral Code</h3>
                      <div className="space-y-3">
                        <p className="text-sm opacity-80">Enter someone's referral code to give them credit for your purchases.</p>
                        <div className="flex space-x-2">
                          <Input
                            placeholder="Enter Referral Code"
                            value={referralCode}
                            onChange={(e) => setReferralCode(e.target.value)}
                            className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                            disabled={!!savedReferrer}
                          />
                          <Button 
                            onClick={handleBindReferralCode}
                            variant="default"
                            className="whitespace-nowrap bg-gradient-to-r from-[#3c28a7] to-[#9f2dfd] hover:from-[#3c28a7]/80 hover:to-[#9f2dfd]/80 text-white border-none"
                            disabled={!!savedReferrer || isLoading}
                          >
                            {isLoading ? (
                              <>
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                Binding...
                              </>
                            ) : (
                              'Bind Code'
                            )}
                          </Button>
                        </div>
                        {savedReferrer && (
                          <div className="p-3 bg-green-500/20 rounded-lg text-sm">
                            <div className="flex justify-between items-center">
                              <p>You are using referral code: <span className="font-mono font-semibold">{savedReferrer}</span></p>
                            </div>
                          </div>
                        )}
                      </div>
                    
                    {/* Display Referral Stats with Feeders Balance */}
                    <div className="mt-6 space-y-4">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="text-xl font-semibold">Your Referral Stats</h3>
                        <div className="bg-gradient-to-r from-[#ffb347] to-[#ffcc33] px-4 py-2 rounded-lg flex items-center">
                          <span className="font-bold text-black">{feedersBalance}</span>
                          <span className="ml-2 text-black font-medium">Feeders</span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white/10 p-3 rounded-lg text-center">
                          <p className="font-medium text-yellow-400">Invalid Invites</p>
                          <p className="text-2xl font-bold">{referralStats.invalidInvites}</p>
                          <p className="text-xs opacity-80">Bound but no purchase</p>
                        </div>
                        <div className="bg-white/10 p-3 rounded-lg text-center">
                          <p className="font-medium text-blue-400">Valid Invites</p>
                          <p className="text-2xl font-bold">{referralStats.validInvites}</p>
                          <p className="text-xs opacity-80">Any purchase amount</p>
                        </div>
                        <div className="bg-white/10 p-3 rounded-lg text-center">
                          <p className="font-medium text-green-400">Eligible Invites</p>
                          <p className="text-2xl font-bold">{referralStats.eligibleInvites}</p>
                          <p className="text-xs opacity-80">100+ $SPIDER purchased</p>
                        </div>
                      </div>
                      <Button
                        onClick={() => {
                          fetchReferralStats();
                          fetchFeedersBalance();
                        }}
                        variant="default"
                        size="sm"
                        className="w-full bg-gradient-to-r from-[#3c28a7] to-[#9f2dfd] hover:from-[#3c28a7]/80 hover:to-[#9f2dfd]/80 text-white border-none"
                      >
                        Refresh Referral Stats
                      </Button>
                    </div>
                    
                      <div className="mt-6 space-y-4">
                        <h3 className="text-xl font-semibold">How it works</h3>
                        <div className="space-y-3">
                          <div className="bg-white/10 p-3 rounded-lg">
                            <p className="font-medium">1. Share your referral code</p>
                            <p className="text-sm opacity-80">Share your unique code with friends</p>
                          </div>
                          <div className="bg-white/10 p-3 rounded-lg">
                            <p className="font-medium">2. Friends buy $SPIDER</p>
                            <p className="text-sm opacity-80">They enter your code during purchase</p>
                          </div>
                          <div className="bg-white/10 p-3 rounded-lg">
                            <p className="font-medium">3. Both earn Feeders rewards</p>
                            <p className="text-sm opacity-80">
                              Both you and your friend get 5 Feeders<br />
                              when they purchase any amount of $SPIDER
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-6 space-y-4">
                      <h3 className="text-xl font-semibold">Submit SUI Wallet</h3>
                      <div className="space-y-3">
                        <p className="text-sm opacity-80">Submit your SUI wallet address to participate in the ecosystem.</p>
                        <div className="flex flex-col gap-2">
                          <div className="flex space-x-2">
                            <Input
                              placeholder="Enter SUI Wallet Address"
                              value={suiWalletAddress}
                              onChange={(e) => setSuiWalletAddress(e.target.value)}
                              className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                            />
                            <Button 
                              onClick={handleSuiWalletSubmit}
                              variant="default"
                              className="whitespace-nowrap bg-gradient-to-r from-[#3c28a7] to-[#9f2dfd] hover:from-[#3c28a7]/80 hover:to-[#9f2dfd]/80 text-white border-none"
                            >
                              Submit
                            </Button>
                          </div>
                          {connected && userReferralCode && (
                            <div className="bg-white/10 p-2 rounded text-sm">
                              {playerData?.suiWalletAddress ? (
                                <div className="flex items-center justify-between">
                                  <span>Submitted Wallet: </span>
                                  <span className="font-mono">
                                    {`${playerData.suiWalletAddress.slice(0, 6)}...${playerData.suiWalletAddress.slice(-4)}`}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-yellow-400">No wallet submitted yet</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="mb-4">Connect your wallet to get your referral code</p>
                    <TonConnectButton />
                    {connected && !userReferralCode && (
                      <div className="mt-4 p-2 bg-red-500/20 rounded text-sm">
                        <p>Wallet connected but referral code not generated.</p>
                        <Button
                          onClick={() => {
                            if (walletAddress) {
                              setUserReferralCode(walletAddress.slice(0, 8));
                            }
                          }}
                          variant="default"
                          size="sm"
                          className="mt-2 bg-gradient-to-r from-[#3c28a7] to-[#9f2dfd] hover:from-[#3c28a7]/80 hover:to-[#9f2dfd]/80 text-white border-none"
                        >
                          Generate Manually
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leaderboard">
            <Card className="bg-white/10 backdrop-blur-lg border-none text-white">
              <CardHeader>
                <CardTitle className="flex items-center justify-center gap-2">
                  <Trophy className="h-6 w-6" />
                  Referral Leaderboard
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isFetchingLeaderboard ? (
                  <div className="flex justify-center items-center py-8">
                    <RefreshCw className="mr-2 h-6 w-6 animate-spin" />
                    <span>Loading leaderboard...</span>
                  </div>
                ) : leaderboard.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-white">Rank</TableHead>
                        <TableHead className="text-white">Referrer</TableHead>
                        <TableHead className="text-white text-right">Total TON</TableHead>
                        <TableHead className="text-white text-right">Invites</TableHead>
                        <TableHead className="text-white text-right">Eligible</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaderboard.map((entry, index) => (
                        <TableRow key={entry.referrer}>
                          <TableCell className="text-white">{index + 1}</TableCell>
                          <TableCell className="text-white font-mono">
                            {entry.referrer}
                          </TableCell>
                          <TableCell className="text-white text-right">
                            {entry.totalAmount.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-white text-right">
                            {entry.validInvites || 0}
                          </TableCell>
                          <TableCell className="text-white text-right">
                            {entry.eligibleInvites || 0}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <p>No referrals recorded yet. Be the first!</p>
                  </div>
                )}
                
                <div className="mt-4">
                  <Button 
                    onClick={() => {
                      // Clear any previous errors
                      setError(null);
                      
                      // Reset leaderboard state before fetching to avoid showing stale data
                      if (isFetchingLeaderboard) return;
                      
                      setIsFetchingLeaderboard(true);
                      fetchLeaderboard().catch(() => {
                        // Silently handle any errors here
                        setIsFetchingLeaderboard(false);
                      });
                    }}
                    variant="default"
                    size="sm" 
                    className="w-full bg-gradient-to-r from-[#3c28a7] to-[#9f2dfd] hover:from-[#3c28a7]/80 hover:to-[#9f2dfd]/80 text-white border-none"
                    disabled={isFetchingLeaderboard}
                  >
                    {isFetchingLeaderboard ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Refresh Leaderboard
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      {/* Update the toast container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-3">
        {toasts.map(({ id, message, type }) => (
          <div key={id} className="toast-enter">
            <Toast
              variant={type === 'success' ? 'default' : 'destructive'}
            >
              {message}
            </Toast>
          </div>
        ))}
      </div>
    </main>
  );
}
