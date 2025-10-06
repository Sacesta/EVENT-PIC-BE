const express = require('express');
const mongoose = require('mongoose');
const Joi = require('joi');
const Attendee = require('../models/Attendee');
const Ticket = require('../models/Ticket');
const Event = require('../models/Event');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Validation schema for attendee registration
const registerAttendeeSchema = Joi.object({
  eventId: Joi.string().required(),
  tickets: Joi.array().items(Joi.object({
    ticketId: Joi.string().required(),
    quantity: Joi.number().min(1).required()
  })).min(1).required(),
  attendeeInfo: Joi.object({
    fullName: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().required(),
    age: Joi.number().min(1).max(150).required(),
    gender: Joi.string().valid('male', 'female', 'other', 'prefer-not-to-say').required()
  }).required(),
  specialRequirements: Joi.string().max(500).optional()
});

// @desc    Register attendee and book tickets (Public - No authentication required)
// @route   POST /api/attendees/register
// @access  Public
router.post('/register', async (req, res) => {
  try {
    // Validate input
    const { error, value } = registerAttendeeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { eventId, tickets, attendeeInfo, specialRequirements } = value;

    // Verify event exists and is public
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    if (!event.isPublic) {
      return res.status(403).json({
        success: false,
        message: 'This event is not open for public registration'
      });
    }

    // Check if event has ended
    if (new Date(event.endDate) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'This event has already ended'
      });
    }

    // Process each ticket type
    const registeredAttendees = [];
    const ticketUpdates = [];
    let totalAmount = 0;

    for (const ticketRequest of tickets) {
      const { ticketId, quantity } = ticketRequest;

      // Check if ticketId is a valid MongoDB ObjectId format
      const isValidObjectId = mongoose.Types.ObjectId.isValid(ticketId) && 
                             /^[0-9a-fA-F]{24}$/.test(ticketId);
      
      let ticket = null;
      let isEmbeddedTicket = false;
      let ticketType = ticketId;
      let ticketPrice = 0;
      let ticketName = ticketId;

      // Only try to find ticket document if ticketId is a valid ObjectId
      if (isValidObjectId) {
        ticket = await Ticket.findById(ticketId);
      }

      if (!ticket) {
        // Ticket might be embedded in event or ticketId is actually a ticket type string
        // Check if event has embedded ticket info
        if (!event.ticketInfo || !event.ticketInfo.priceRange) {
          return res.status(404).json({
            success: false,
            message: `Ticket information not found for this event`
          });
        }

        // Handle embedded ticket scenario
        isEmbeddedTicket = true;
        ticketType = ticketId; // ticketId is actually the ticket type/name
        ticketName = ticketId;
        
        // Use event's price range for embedded tickets
        // If event is free, set price to 0
        if (event.ticketInfo.isFree) {
          ticketPrice = 0;
        } else {
          ticketPrice = event.ticketInfo.priceRange?.min || 0;
        }
        
        // Check if enough tickets are available (for embedded tickets)
        const remainingTickets = (event.ticketInfo.availableTickets || 0) - 
                                (event.ticketInfo.soldTickets || 0) - 
                                (event.ticketInfo.reservedTickets || 0);
        
        if (quantity > remainingTickets) {
          return res.status(400).json({
            success: false,
            message: `Not enough tickets available. Only ${remainingTickets} tickets remaining.`
          });
        }
      } else {
        // Ticket document exists - use original validation logic
        // Verify ticket belongs to the event
        if (ticket.eventId.toString() !== eventId) {
          return res.status(400).json({
            success: false,
            message: `Ticket ${ticket.title} does not belong to this event`
          });
        }

        // Check if ticket is active and available
        if (ticket.status !== 'active') {
          return res.status(400).json({
            success: false,
            message: `Ticket ${ticket.title} is not available for purchase (Status: ${ticket.status})`
          });
        }

        // Check if enough tickets are available
        const availableTickets = ticket.quantity.available - ticket.quantity.sold - ticket.quantity.reserved;
        if (quantity > availableTickets) {
          return res.status(400).json({
            success: false,
            message: `Not enough tickets available for ${ticket.title}. Only ${availableTickets} tickets remaining.`
          });
        }

        // Check max per person restriction
        if (ticket.restrictions && ticket.restrictions.maxPerPerson && quantity > ticket.restrictions.maxPerPerson) {
          return res.status(400).json({
            success: false,
            message: `Maximum ${ticket.restrictions.maxPerPerson} tickets allowed per person for ${ticket.title}`
          });
        }

        // Check age restrictions
        if (ticket.restrictions && ticket.restrictions.ageLimit) {
          const { min, max } = ticket.restrictions.ageLimit;
          if (min && attendeeInfo.age < min) {
            return res.status(400).json({
              success: false,
              message: `Minimum age requirement for ${ticket.title} is ${min} years`
            });
          }
          if (max && attendeeInfo.age > max) {
            return res.status(400).json({
              success: false,
              message: `Maximum age limit for ${ticket.title} is ${max} years`
            });
          }
        }

        ticketType = ticket.type;
        ticketPrice = ticket.price.amount;
        ticketName = ticket.title;
      }

      // Calculate amount
      const ticketTotal = ticketPrice * quantity;
      totalAmount += ticketTotal;

      // Generate unique booking reference
      const bookingReference = await Attendee.generateBookingReference();

      // Create attendee record
      const attendee = new Attendee({
        eventId,
        ticketId: isEmbeddedTicket ? null : ticketId, // Set to null if embedded ticket
        fullName: attendeeInfo.fullName,
        email: attendeeInfo.email,
        phone: attendeeInfo.phone,
        age: attendeeInfo.age,
        gender: attendeeInfo.gender,
        ticketType: ticketType,
        ticketTitle: ticketName,
        ticketQuantity: quantity,
        ticketPrice: ticketPrice,
        totalAmount: ticketTotal,
        bookingReference,
        bookingStatus: 'confirmed',
        paymentStatus: 'completed',
        specialRequirements: specialRequirements || ''
      });

      registeredAttendees.push(attendee);

      // Prepare ticket update
      ticketUpdates.push({
        ticket,
        quantity,
        isEmbedded: isEmbeddedTicket
      });
    }

    // Save all attendees
    const savedAttendees = await Attendee.insertMany(registeredAttendees);

    // Update ticket quantities
    console.log('=== UPDATING TICKET QUANTITIES ===');
    for (const update of ticketUpdates) {
      const { ticket, quantity, isEmbedded } = update;
      
      if (!isEmbedded && ticket) {
        console.log(`Updating ticket ${ticket._id}: Current sold = ${ticket.quantity.sold}, Adding ${quantity}`);
        
        // Update separate ticket document
        ticket.quantity.sold += quantity;
        
        // Auto-update status to sold_out if no tickets remaining
        const remaining = ticket.quantity.available - ticket.quantity.sold - ticket.quantity.reserved;
        console.log(`Remaining tickets after update: ${remaining}`);
        
        if (remaining <= 0) {
          ticket.status = 'sold_out';
          if (!ticket.metadata) {
            ticket.metadata = {};
          }
          ticket.metadata.soldOutAt = new Date();
          console.log(`Ticket ${ticket._id} marked as SOLD OUT`);
        }
        
        await ticket.save();
        console.log(`Ticket ${ticket._id} saved successfully. New sold count: ${ticket.quantity.sold}`);
      } else if (isEmbedded) {
        console.log(`Skipping embedded ticket update for quantity ${quantity}`);
      }
    }

    // Update event ticket info
    console.log('=== UPDATING EVENT TICKET INFO ===');
    const updatedEvent = await Event.findById(eventId);
    if (updatedEvent && updatedEvent.ticketInfo) {
      // Calculate total sold tickets from all ticket documents
      const allTickets = await Ticket.find({ eventId });
      console.log(`Found ${allTickets.length} ticket documents for event ${eventId}`);
      
      if (allTickets.length > 0) {
        const totalSold = allTickets.reduce((sum, t) => sum + (t.quantity?.sold || 0), 0);
        console.log(`Total sold tickets across all types: ${totalSold}`);
        updatedEvent.ticketInfo.soldTickets = totalSold;
      } else {
        // Use embedded ticket info if no separate tickets
        const totalTicketsSold = ticketUpdates.reduce((sum, update) => sum + update.quantity, 0);
        updatedEvent.ticketInfo.soldTickets = (updatedEvent.ticketInfo.soldTickets || 0) + totalTicketsSold;
        console.log(`Updated embedded ticket sold count: ${updatedEvent.ticketInfo.soldTickets}`);
      }
      
      await updatedEvent.save();
      console.log('Event ticketInfo updated successfully');
    }
    console.log('=== TICKET UPDATE COMPLETE ===');

    // Populate attendee details for response
    const populatedAttendees = await Attendee.find({
      _id: { $in: savedAttendees.map(a => a._id) }
    })
    .populate('ticketId', 'title type price description')
    .populate('eventId', 'name startDate endDate location');

    res.status(201).json({
      success: true,
      message: 'Registration successful! Your tickets have been booked.',
      data: {
        attendees: populatedAttendees,
        totalAmount,
        bookingReferences: savedAttendees.map(a => a.bookingReference)
      }
    });

  } catch (error) {
    console.error('Attendee registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering attendee',
      error: error.message
    });
  }
});

// @desc    Get all attendees for an event (Producer only)
// @route   GET /api/attendees/event/:eventId
// @access  Private (Producer only)
router.get('/event/:eventId', protect, async (req, res) => {
  try {
    const { eventId } = req.params;
    const {
      page = 1,
      limit = 20,
      status,
      search,
      ticketType,
      checkedIn
    } = req.query;

    // Verify event exists
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if user is the producer of this event
    if (req.user.role === 'producer' && event.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view attendees for this event'
      });
    }

    // Build filter
    const filter = { eventId };

    if (status) {
      filter.bookingStatus = status;
    }

    if (ticketType) {
      filter.ticketType = ticketType;
    }

    if (checkedIn !== undefined) {
      filter.checkedIn = checkedIn === 'true';
    }

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      filter.$or = [
        { fullName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { bookingReference: searchRegex }
      ];
    }

    // Execute query with pagination
    const attendees = await Attendee.find(filter)
      .populate('ticketId', 'title type price description')
      .sort({ registeredAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    // Get total count
    const total = await Attendee.countDocuments(filter);

    // Get event statistics
    const statistics = await Attendee.getEventStatistics(eventId);

    res.json({
      success: true,
      data: attendees,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalAttendees: total,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1
      },
      statistics
    });

  } catch (error) {
    console.error('Get attendees error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendees',
      error: error.message
    });
  }
});

// @desc    Get attendee by booking reference
// @route   GET /api/attendees/booking/:bookingReference
// @access  Public
router.get('/booking/:bookingReference', async (req, res) => {
  try {
    const { bookingReference } = req.params;

    const attendee = await Attendee.findOne({ bookingReference })
      .populate('ticketId', 'title type price description features')
      .populate('eventId', 'name description startDate endDate location image');

    if (!attendee) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    res.json({
      success: true,
      data: attendee
    });

  } catch (error) {
    console.error('Get attendee by booking reference error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching booking details',
      error: error.message
    });
  }
});

// @desc    Check in attendee (Producer/Admin only)
// @route   PUT /api/attendees/:id/check-in
// @access  Private (Producer/Admin only)
router.put('/:id/check-in', protect, authorize('producer', 'admin'), async (req, res) => {
  try {
    const attendee = await Attendee.findById(req.params.id)
      .populate('eventId', 'producerId');

    if (!attendee) {
      return res.status(404).json({
        success: false,
        message: 'Attendee not found'
      });
    }

    // Check if user is authorized (producer of the event or admin)
    if (req.user.role === 'producer' && 
        attendee.eventId.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to check in attendees for this event'
      });
    }

    await attendee.checkIn(req.user._id);

    res.json({
      success: true,
      message: 'Attendee checked in successfully',
      data: attendee
    });

  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error checking in attendee',
      error: error.message
    });
  }
});

// @desc    Cancel booking (Producer/Admin only)
// @route   PUT /api/attendees/:id/cancel
// @access  Private (Producer/Admin only)
router.put('/:id/cancel', protect, authorize('producer', 'admin'), async (req, res) => {
  try {
    const attendee = await Attendee.findById(req.params.id)
      .populate('eventId', 'producerId')
      .populate('ticketId');

    if (!attendee) {
      return res.status(404).json({
        success: false,
        message: 'Attendee not found'
      });
    }

    // Check if user is authorized
    if (req.user.role === 'producer' && 
        attendee.eventId.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel bookings for this event'
      });
    }

    await attendee.cancelBooking();

    // Return tickets to available pool
    const ticket = attendee.ticketId;
    if (ticket) {
      ticket.quantity.sold -= attendee.ticketQuantity;
      
      // Update status if it was sold out
      if (ticket.status === 'sold_out') {
        ticket.status = 'active';
      }
      
      await ticket.save();
    }

    // Update event ticket info
    const event = await Event.findById(attendee.eventId._id);
    if (event && event.ticketInfo) {
      event.ticketInfo.soldTickets -= attendee.ticketQuantity;
      await event.save();
    }

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: attendee
    });

  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error cancelling booking',
      error: error.message
    });
  }
});

// @desc    Get attendee statistics for event (Producer only)
// @route   GET /api/attendees/event/:eventId/statistics
// @access  Private (Producer only)
router.get('/event/:eventId/statistics', protect, authorize('producer', 'admin'), async (req, res) => {
  try {
    const { eventId } = req.params;

    // Verify event exists
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check authorization
    if (req.user.role === 'producer' && event.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view statistics for this event'
      });
    }

    // Get comprehensive statistics
    const statistics = await Attendee.getEventStatistics(eventId);

    // Get ticket type breakdown
    const ticketBreakdown = await Attendee.aggregate([
      { $match: { eventId: new mongoose.Types.ObjectId(eventId), bookingStatus: 'confirmed' } },
      {
        $group: {
          _id: '$ticketType',
          count: { $sum: 1 },
          totalTickets: { $sum: '$ticketQuantity' },
          revenue: { $sum: '$totalAmount' }
        }
      }
    ]);

    // Get registration timeline (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const timeline = await Attendee.aggregate([
      {
        $match: {
          eventId: new mongoose.Types.ObjectId(eventId),
          registeredAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$registeredAt' }
          },
          count: { $sum: 1 },
          tickets: { $sum: '$ticketQuantity' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        overall: statistics,
        ticketBreakdown,
        registrationTimeline: timeline
      }
    });

  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
});

// @desc    Export attendees list (Producer only)
// @route   GET /api/attendees/event/:eventId/export
// @access  Private (Producer only)
router.get('/event/:eventId/export', protect, authorize('producer', 'admin'), async (req, res) => {
  try {
    const { eventId } = req.params;

    // Verify event and authorization
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    if (req.user.role === 'producer' && event.producerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to export attendees for this event'
      });
    }

    // Get all confirmed attendees
    const attendees = await Attendee.find({
      eventId,
      bookingStatus: 'confirmed'
    })
    .populate('ticketId', 'title type price')
    .sort({ registeredAt: -1 });

    // Format data for export
    const exportData = attendees.map(attendee => ({
      'Booking Reference': attendee.bookingReference,
      'Full Name': attendee.fullName,
      'Email': attendee.email,
      'Phone': attendee.phone,
      'Age': attendee.age,
      'Gender': attendee.gender,
      'Ticket Type': attendee.ticketId?.title || attendee.ticketType,
      'Quantity': attendee.ticketQuantity,
      'Price': attendee.ticketPrice,
      'Total Amount': attendee.totalAmount,
      'Registered At': attendee.registeredAt.toISOString(),
      'Checked In': attendee.checkedIn ? 'Yes' : 'No',
      'Checked In At': attendee.checkedInAt ? attendee.checkedInAt.toISOString() : 'N/A',
      'Special Requirements': attendee.specialRequirements || 'None'
    }));

    res.json({
      success: true,
      data: exportData,
      count: exportData.length
    });

  } catch (error) {
    console.error('Export attendees error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting attendees',
      error: error.message
    });
  }
});

module.exports = router;
