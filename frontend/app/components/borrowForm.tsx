// lend and borrow form

import { useState } from "react";

export default function SupplyMoveForm() {
  const [activeTab, setActiveTab] = useState("supply");
  const [amount, setAmount] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [canReview, setCanReview] = useState(false);

  const walletBalance = 0;
  const supplied = 0;
  const supplyAPY = 156.0;
  const healthFactor = "N/A";

  const handleMax = () => {
    setAmount(walletBalance.toString());
  };

  return (
    <div className="bg-zinc-900 rounded-lg w-full max-w-md shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-center p-4 border-b border-zinc-800">
        <h2 className="text-white text-lg font-semibold">Supply MOVE</h2>
      </div>

      {/* Tabs */}
      <div className="flex p-2 gap-2 border-b border-zinc-800">
        <button
          onClick={() => setActiveTab("supply")}
          className={`flex-1 py-3 text-sm rounded-md font-medium transition-colors ${
            activeTab === "supply"
              ? "bg-green-600 text-white"
              : "bg-zinc-800 text-zinc-400 hover:text-white"
          }`}
        >
          Supply
        </button>
        <button
          onClick={() => setActiveTab("withdraw")}
          className={`flex-1 py-3 text-sm font-medium rounded-md transition-colors ${
            activeTab === "withdraw"
              ? " bg-green-600 text-white"
              : "bg-zinc-800 text-zinc-400 hover:text-white"
          }`}
        >
          Withdraw
        </button>
      </div>

      {/* Form Content */}
      <div className="p-6">
        {/* Amount Input */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-400 rounded-full flex items-center justify-center">
              <span className="text-black font-bold text-sm">M</span>
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full bg-transparent text-4xl text-zinc-500 font-light outline-none"
              />
              <div className="text-zinc-500 text-sm mt-1">$0.00</div>
            </div>
            <button
              onClick={handleMax}
              className="px-4 py-1 bg-green-400 text-black text-sm font-medium rounded hover:bg-yellow-500 transition-colors"
            >
              Max
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-3 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm">Health factor</span>
            <span className="text-green-400 text-sm font-medium">
              {healthFactor}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm">Supplied</span>
            <span className="text-white text-sm font-medium">
              {supplied} MOVE
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm">Supply APY</span>
            <span className="text-white text-sm font-medium">{supplyAPY}%</span>
          </div>
        </div>

        {/* More Button */}
        <button
          onClick={() => setShowMore(!showMore)}
          className="w-full text-yellow-400 text-sm font-medium py-2 hover:text-yellow-300 transition-colors"
        >
          {showMore ? "Less" : "More"}
        </button>

        {/* Review Button */}
        <button
          onClick={() => {}}
          disabled={!canReview}
          className="w-full bg-green-400 text-black font-medium py-3 rounded-lg hover:bg-green-500 cursor-pointer transition-colors mt-4"
        >
          Review
        </button>

        {/* Wallet Balance */}
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-zinc-800">
          <span className="text-zinc-400 text-sm">Wallet balance</span>
          <span className="text-white text-sm font-medium">
            {walletBalance} MOVE
          </span>
        </div>
      </div>
    </div>
  );
}
