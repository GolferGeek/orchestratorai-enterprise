import * as crypto from 'crypto';
import { CapabilityOffer, NegotiationResult } from '@agent-communication/shared-types';
import { INegotiationProvider } from '../negotiation.interface';

interface Bid {
  agentId: string;
  capabilities: string[];
  price: number;
  currency: string;
  capabilityScore: number;
  submittedAt: number;
}

interface Auction {
  auctionId: string;
  requestedCapabilities: string[];
  requestedProtocols: string[];
  bids: Bid[];
  status: 'open' | 'awarded' | 'closed';
  winnerId?: string;
  createdAt: number;
  closedAt?: number;
}

/**
 * Auction-based negotiation provider.
 *
 * Agents compete for task assignment by submitting bids. The auction evaluates
 * bids by comparing price and capability match score. Lower price wins when
 * capability scores are equal; better capability match wins when prices are equal.
 */
export class AuctionNegotiationProvider implements INegotiationProvider {
  readonly providerId = 'auction';

  private auctions = new Map<string, Auction>();

  /**
   * Calculates a capability match score (0-1) based on how many requested
   * capabilities the bidder can fulfill.
   */
  private calculateCapabilityScore(
    offered: string[],
    requested: string[],
  ): number {
    if (requested.length === 0) return 0;
    const matched = requested.filter((c) => offered.includes(c));
    return matched.length / requested.length;
  }

  /**
   * Extracts a total price from a CapabilityOffer's pricing map.
   */
  private extractTotalPrice(offer: CapabilityOffer): { price: number; currency: string } {
    let totalPrice = 0;
    let currency = 'USD';

    for (const [, pricing] of Object.entries(offer.pricing)) {
      if (pricing.model === 'paid' && pricing.amount !== undefined) {
        totalPrice += pricing.amount;
        if (pricing.currency) currency = pricing.currency;
      }
    }

    return { price: totalPrice, currency };
  }

  async proposeCapabilities(offer: CapabilityOffer): Promise<NegotiationResult> {
    const auctionId = crypto.randomUUID();
    const { price, currency } = this.extractTotalPrice(offer);
    const capabilityScore = this.calculateCapabilityScore(
      offer.capabilities,
      offer.capabilities, // Self-score is always 1.0 for the initiator
    );

    const auction: Auction = {
      auctionId,
      requestedCapabilities: offer.capabilities,
      requestedProtocols: offer.protocols,
      bids: [
        {
          agentId: offer.agentId,
          capabilities: offer.capabilities,
          price,
          currency,
          capabilityScore,
          submittedAt: Date.now(),
        },
      ],
      status: 'open',
      createdAt: Date.now(),
    };
    this.auctions.set(auctionId, auction);

    // An auction always starts as a counter-offer — waiting for competing bids
    return {
      status: 'counter-offer',
      agreedCapabilities: offer.capabilities,
      counterOffer: {
        agentId: 'auction-system',
        capabilities: offer.capabilities,
        protocols: offer.protocols,
        pricing: {
          _auction: {
            model: 'paid',
            amount: price,
            currency,
          },
        },
      },
    };
  }

  async negotiate(counterOffer: CapabilityOffer): Promise<NegotiationResult> {
    // Find the open auction that matches the requested capabilities
    let targetAuction: Auction | undefined;
    for (const auction of this.auctions.values()) {
      if (auction.status === 'open') {
        const overlap = counterOffer.capabilities.filter((c) =>
          auction.requestedCapabilities.includes(c),
        );
        if (overlap.length > 0) {
          targetAuction = auction;
          break;
        }
      }
    }

    if (!targetAuction) {
      return {
        status: 'rejected',
        reason: 'No open auction found for the offered capabilities',
      };
    }

    const { price, currency } = this.extractTotalPrice(counterOffer);
    const capabilityScore = this.calculateCapabilityScore(
      counterOffer.capabilities,
      targetAuction.requestedCapabilities,
    );

    const newBid: Bid = {
      agentId: counterOffer.agentId,
      capabilities: counterOffer.capabilities,
      price,
      currency,
      capabilityScore,
      submittedAt: Date.now(),
    };
    targetAuction.bids.push(newBid);

    // Evaluate all bids: best capability score wins; ties broken by lowest price
    const sortedBids = [...targetAuction.bids].sort((a, b) => {
      if (b.capabilityScore !== a.capabilityScore) {
        return b.capabilityScore - a.capabilityScore;
      }
      return a.price - b.price;
    });

    const bestBid = sortedBids[0];

    // If the new bid is currently winning, return agreed
    if (bestBid.agentId === counterOffer.agentId) {
      return {
        status: 'agreed',
        agreedCapabilities: counterOffer.capabilities.filter((c) =>
          targetAuction!.requestedCapabilities.includes(c),
        ),
        agreedProtocol: counterOffer.protocols[0],
      };
    }

    // Otherwise, return counter-offer showing the current best bid
    return {
      status: 'counter-offer',
      agreedCapabilities: bestBid.capabilities,
      counterOffer: {
        agentId: bestBid.agentId,
        capabilities: bestBid.capabilities,
        protocols: targetAuction.requestedProtocols,
        pricing: {
          _currentBest: {
            model: 'paid',
            amount: bestBid.price,
            currency: bestBid.currency,
          },
        },
      },
    };
  }

  async agree(terms: CapabilityOffer): Promise<void> {
    // Award the auction to the specified agent
    for (const auction of this.auctions.values()) {
      if (auction.status !== 'open') continue;

      const winningBid = auction.bids.find((b) => b.agentId === terms.agentId);
      if (winningBid) {
        auction.status = 'awarded';
        auction.winnerId = terms.agentId;
        auction.closedAt = Date.now();
        return;
      }
    }

    throw new Error(`No open auction found with a bid from agent "${terms.agentId}"`);
  }

  async reject(reason: string): Promise<void> {
    // Close all open auctions with no winner
    for (const auction of this.auctions.values()) {
      if (auction.status === 'open') {
        auction.status = 'closed';
        auction.closedAt = Date.now();
      }
    }
  }

  getAuctions(): Map<string, Auction> {
    return new Map(this.auctions);
  }
}
